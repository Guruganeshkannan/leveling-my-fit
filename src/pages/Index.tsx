import { useEffect, useMemo, useState } from "react";
import heroBg from "@/assets/solo-leveling-glow-bg.jpg";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
} from "recharts";
import { Dumbbell, Salad, Trophy, Backpack, ChartNoAxesGantt, Settings, Camera } from "lucide-react";

// Data types
interface Stats {
  Strength: number;
  Endurance: number;
  Agility: number;
  Vitality: number;
  Intelligence: number;
  Willpower: number;
}

interface WorkoutSet {
  exercise: string;
  sets: number;
  reps: number;
  weight: number; // kg
  minutes: number; // duration
}

interface WorkoutEntry {
  id: string;
  date: string; // ISO
  items: WorkoutSet[];
}

interface DietEntry {
  id: string;
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Quest {
  id: string;
  title: string;
  type: "daily" | "weekly";
  target?: number;
  progress?: number;
  rewardExp: number;
  rewardCoins: number;
  completed: boolean;
}

interface WeightEntry { date: string; weight: number; bodyFat?: number | null }
interface Photo { id: string; date: string; dataUrl: string }

interface SettingsState {
  name: string;
  calorieGoal: number;
  expMultipliers: {
    minutes: number; // default 2 per minute
    totalWeight: number; // default 1/10 per kg
    protein: number; // default 1/2 per g
  };
}

interface SaveState {
  level: number;
  exp: number;
  nextLevelExp: number;
  coins: number;
  stats: Stats;
  workouts: WorkoutEntry[];
  diet: DietEntry[];
  quests: Quest[];
  inventory: string[];
  weights: WeightEntry[];
  photos: Photo[];
  settings: SettingsState;
}

const STORAGE_KEY = "solo-leveling-irl-offline";

const defaultState: SaveState = {
  level: 1,
  exp: 0,
  nextLevelExp: Math.floor(100 * Math.pow(1.2, 1 - 1)),
  coins: 0,
  stats: {
    Strength: 0,
    Endurance: 0,
    Agility: 0,
    Vitality: 0,
    Intelligence: 0,
    Willpower: 0,
  },
  workouts: [],
  diet: [],
  quests: [
    { id: "dq1", title: "Consume 120g protein", type: "daily", target: 120, progress: 0, rewardExp: 50, rewardCoins: 5, completed: false },
    { id: "dq2", title: "Workout 60 min", type: "daily", target: 60, progress: 0, rewardExp: 60, rewardCoins: 5, completed: false },
    { id: "wq1", title: "Increase squat by 5kg", type: "weekly", rewardExp: 150, rewardCoins: 20, completed: false },
  ],
  inventory: ["Beginner's Training Manual"],
  weights: [],
  photos: [],
  settings: {
    name: "Player",
    calorieGoal: 2200,
    expMultipliers: {
      minutes: 2,
      totalWeight: 0.1, // 1/10
      protein: 0.5, // 1/2
    },
  },
};

// Helpers
const uid = () => Math.random().toString(36).slice(2);
const nextLevelThreshold = (level: number) => Math.floor(100 * Math.pow(1.2, level - 1));

function playBeep(frequency = 880, duration = 180) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = frequency;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);
    o.stop(ctx.currentTime + duration / 1000 + 0.02);
  } catch (_) {}
}

function Index() {
  const [state, setState] = useState<SaveState>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SaveState) : defaultState;
  });
  const [tab, setTab] = useState("stats");

  // Persist
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Derived EXP bar percent
  const expPercent = useMemo(() => Math.min(100, (state.exp / state.nextLevelExp) * 100), [state.exp, state.nextLevelExp]);

  function addGlobalExp(delta: number) {
    if (delta <= 0) return;
    setState((prev) => {
      let exp = prev.exp + delta;
      let level = prev.level;
      let coins = prev.coins;
      let next = prev.nextLevelExp;
      let leveled = false;
      while (exp >= next) {
        exp -= next;
        level += 1;
        coins += 10; // small coin bonus on level up
        next = nextLevelThreshold(level);
        leveled = true;
      }
      if (leveled) {
        toast({ title: "Level Up!", description: `You reached level ${level}.`, });
        playBeep(1200, 220);
      }
      return { ...prev, exp, level, coins, nextLevelExp: next };
    });
  }

  // EXP calculations
  const calcWorkoutExp = (entry: WorkoutEntry) => {
    const totalMinutes = entry.items.reduce((a, b) => a + (b.minutes || 0), 0);
    const totalWeight = entry.items.reduce((a, b) => a + (b.weight * b.reps * b.sets), 0);
    const { minutes, totalWeight: tw } = state.settings.expMultipliers;
    const strengthExp = totalWeight * tw; // total_weight_lifted / 10
    const enduranceExp = totalMinutes * minutes; // workout_minutes * 2
    return { strengthExp, enduranceExp, totalMinutes, totalWeight };
  };

  const calcDietExp = (entry: DietEntry) => {
    const { protein: pm } = state.settings.expMultipliers;
    const vitalityExp = entry.protein * pm; // protein/2
    const bonus = Math.abs(entry.calories - state.settings.calorieGoal) <= 100 ? 25 : 0;
    return { vitalityExp: vitalityExp + bonus };
  };

  // Actions
  function addWorkout(items: WorkoutSet[]) {
    const payload: WorkoutEntry = { id: uid(), date: new Date().toISOString(), items };
    const { strengthExp, enduranceExp, totalMinutes, totalWeight } = calcWorkoutExp(payload);
    const expDelta = state.settings.expMultipliers.minutes * totalMinutes + state.settings.expMultipliers.totalWeight * totalWeight;

    setState((prev) => ({
      ...prev,
      workouts: [payload, ...prev.workouts],
      stats: {
        ...prev.stats,
        Strength: prev.stats.Strength + strengthExp,
        Endurance: prev.stats.Endurance + enduranceExp,
      },
    }));

    addGlobalExp(expDelta);
    toast({ title: "Workout logged", description: `+${Math.round(expDelta)} EXP` });
  }

  function addDiet(entry: Omit<DietEntry, "id" | "date">) {
    const payload: DietEntry = { id: uid(), date: new Date().toISOString(), ...entry };
    const { vitalityExp } = calcDietExp(payload);
    const expDelta = vitalityExp;
    setState((prev) => ({
      ...prev,
      diet: [payload, ...prev.diet],
      stats: { ...prev.stats, Vitality: prev.stats.Vitality + vitalityExp },
    }));
    addGlobalExp(expDelta);
    toast({ title: "Diet logged", description: `+${Math.round(expDelta)} EXP` });
  }

  function completeQuest(id: string) {
    setState((prev) => {
      const q = prev.quests.find((x) => x.id === id);
      if (!q || q.completed) return prev;
      const exp = q.rewardExp;
      const coins = q.rewardCoins;
      playBeep(980, 160);
      toast({ title: "Quest Complete", description: `${q.title} +${exp} EXP, +${coins} coins` });
      // apply rewards
      setTimeout(() => addGlobalExp(exp), 0);
      return { ...prev, coins: prev.coins + coins, quests: prev.quests.map((x) => (x.id === id ? { ...x, completed: true } : x)) };
    });
  }

  function addWeight(weight: number, bodyFat?: number) {
    const w: WeightEntry = { date: new Date().toISOString(), weight, bodyFat: bodyFat ?? null };
    setState((prev) => ({ ...prev, weights: [w, ...prev.weights] }));
  }

  async function addPhoto(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const photo: Photo = { id: uid(), date: new Date().toISOString(), dataUrl };
    setState((prev) => ({ ...prev, photos: [photo, ...prev.photos] }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "solo-leveling-irl-offline.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string) as SaveState;
        setState(json);
        toast({ title: "Import successful", description: "Your save file has been loaded." });
      } catch (e) {
        toast({ title: "Import failed", description: "Invalid file format." });
      }
    };
    reader.readAsText(file);
  }

  function resetSave() {
    if (!confirm("Reset all progress?")) return;
    setState(defaultState);
  }

  function duplicateSave() {
    const clone = JSON.stringify(state);
    const a = document.createElement("a");
    const blob = new Blob([clone], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `solo-leveling-save-level-${state.level}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <img src={heroBg} alt="solo leveling blue glow background" className="pointer-events-none select-none fixed inset-0 w-full h-full object-cover opacity-20" loading="lazy" />

      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-border">
        <div className="max-w-screen-sm mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Solo Leveling IRL (Offline)</h1>
            <p className="text-xs text-muted-foreground">A single-player, offline stat system</p>
          </div>
          <div className="text-sm">Lvl {state.level}</div>
        </div>
      </header>

      <main className="max-w-screen-sm mx-auto px-4 py-4 space-y-4">
        {/* Stat Window */}
        <Card className="glow-card animate-enter">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="text-lg">{state.settings.name}'s Status</span>
              <span className="text-sm text-muted-foreground">Coins: {state.coins}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* EXP Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span>EXP</span>
                <span>
                  {Math.round(state.exp)} / {state.nextLevelExp}
                </span>
              </div>
              <div className="h-3 rounded-md bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width] duration-700 ease-out"
                  style={{ width: `${expPercent}%` }}
                />
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(state.stats).map(([k, v]) => (
                <div key={k} className="rounded-md border border-border/60 p-3 bg-card/50">
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div className="text-lg font-semibold">{Math.floor(v)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="stats" className="flex flex-col gap-1">
              <ChartNoAxesGantt className="h-4 w-4" />
              <span className="text-[10px]">Stats</span>
            </TabsTrigger>
            <TabsTrigger value="workout" className="flex flex-col gap-1">
              <Dumbbell className="h-4 w-4" />
              <span className="text-[10px]">Workout</span>
            </TabsTrigger>
            <TabsTrigger value="diet" className="flex flex-col gap-1">
              <Salad className="h-4 w-4" />
              <span className="text-[10px]">Diet</span>
            </TabsTrigger>
            <TabsTrigger value="quests" className="flex flex-col gap-1">
              <Trophy className="h-4 w-4" />
              <span className="text-[10px]">Quests</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex flex-col gap-1">
              <Backpack className="h-4 w-4" />
              <span className="text-[10px]">Inventory</span>
            </TabsTrigger>
            <TabsTrigger value="progress" className="flex flex-col gap-1">
              <Camera className="h-4 w-4" />
              <span className="text-[10px]">Progress</span>
            </TabsTrigger>
          </TabsList>

          {/* Workout Logging */}
          <TabsContent value="workout">
            <WorkoutForm onSubmit={addWorkout} />
            <Separator className="my-4" />
            <HistoryList title="Workouts" items={state.workouts.map((w) => ({ id: w.id, date: w.date, summary: `${w.items.length} ex.` }))} />
          </TabsContent>

          {/* Diet Logging */}
          <TabsContent value="diet">
            <DietForm onSubmit={addDiet} />
            <Separator className="my-4" />
            <HistoryList title="Meals" items={state.diet.map((d) => ({ id: d.id, date: d.date, summary: `${d.calories} kcal, ${d.protein}g P` }))} />
          </TabsContent>

          {/* Quests */}
          <TabsContent value="quests">
            <Card className="glow-card">
              <CardHeader>
                <CardTitle>Quests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.quests.map((q) => (
                  <div key={q.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{q.title}</div>
                      <div className="text-xs text-muted-foreground">{q.type.toUpperCase()} • {q.rewardExp} EXP • {q.rewardCoins} coins</div>
                    </div>
                    <Button size="sm" variant={q.completed ? "secondary" : "default"} onClick={() => completeQuest(q.id)} disabled={q.completed}>
                      {q.completed ? "Completed" : "Complete"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inventory */}
          <TabsContent value="inventory">
            <Card className="glow-card">
              <CardHeader>
                <CardTitle>Inventory</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-6 space-y-1">
                  {state.inventory.map((i, idx) => (
                    <li key={idx}>{i}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Progress */}
          <TabsContent value="progress">
            <ProgressSection
              weights={state.weights}
              onAddWeight={addWeight}
              photos={state.photos}
              onAddPhoto={addPhoto}
            />
          </TabsContent>
        </Tabs>

        {/* Settings */}
        <Card className="glow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Settings & Save</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={state.settings.name} onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, name: e.target.value } }))} />
              </div>
              <div>
                <Label htmlFor="cal">Calorie goal</Label>
                <Input id="cal" type="number" value={state.settings.calorieGoal} onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, calorieGoal: Number(e.target.value || 0) } }))} />
              </div>
            </div>
            <div>
              <div className="text-sm mb-2">EXP Formula Multipliers</div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <Label htmlFor="m">Minutes</Label>
                  <Input id="m" type="number" value={state.settings.expMultipliers.minutes}
                         onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, expMultipliers: { ...p.settings.expMultipliers, minutes: Number(e.target.value || 0) } } }))} />
                </div>
                <div>
                  <Label htmlFor="tw">Total Weight</Label>
                  <Input id="tw" type="number" value={state.settings.expMultipliers.totalWeight}
                         onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, expMultipliers: { ...p.settings.expMultipliers, totalWeight: Number(e.target.value || 0) } } }))} />
                </div>
                <div>
                  <Label htmlFor="p">Protein</Label>
                  <Input id="p" type="number" value={state.settings.expMultipliers.protein}
                         onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, expMultipliers: { ...p.settings.expMultipliers, protein: Number(e.target.value || 0) } } }))} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={duplicateSave}>Duplicate Save</Button>
              <Button variant="secondary" onClick={exportData}>Export JSON</Button>
              <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover-scale">
                <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files && importData(e.target.files[0])} />
                Import JSON
              </label>
              <Button variant="destructive" onClick={resetSave}>Reset</Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="h-16" />
    </div>
  );
}

function WorkoutForm({ onSubmit }: { onSubmit: (items: WorkoutSet[]) => void }) {
  const [items, setItems] = useState<WorkoutSet[]>([
    { exercise: "Squat", sets: 3, reps: 5, weight: 60, minutes: 30 },
  ]);

  function updateItem(idx: number, patch: Partial<WorkoutSet>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((p) => [...p, { exercise: "", sets: 3, reps: 10, weight: 10, minutes: 10 }]);
  }

  return (
    <Card className="glow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Dumbbell className="h-5 w-5" /> Log Workout</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-6 gap-2">
            <div className="col-span-2">
              <Label>Exercise</Label>
              <Input value={it.exercise} onChange={(e) => updateItem(idx, { exercise: e.target.value })} />
            </div>
            <div>
              <Label>Sets</Label>
              <Input type="number" value={it.sets} onChange={(e) => updateItem(idx, { sets: Number(e.target.value || 0) })} />
            </div>
            <div>
              <Label>Reps</Label>
              <Input type="number" value={it.reps} onChange={(e) => updateItem(idx, { reps: Number(e.target.value || 0) })} />
            </div>
            <div>
              <Label>Weight (kg)</Label>
              <Input type="number" value={it.weight} onChange={(e) => updateItem(idx, { weight: Number(e.target.value || 0) })} />
            </div>
            <div>
              <Label>Minutes</Label>
              <Input type="number" value={it.minutes} onChange={(e) => updateItem(idx, { minutes: Number(e.target.value || 0) })} />
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={addItem}>Add Exercise</Button>
          <Button onClick={() => onSubmit(items)}>Save Workout</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DietForm({ onSubmit }: { onSubmit: (entry: Omit<DietEntry, "id" | "date">) => void }) {
  const [form, setForm] = useState({ calories: 600, protein: 40, carbs: 60, fat: 20 });
  return (
    <Card className="glow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Salad className="h-5 w-5" /> Log Meal</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-2">
          <div>
            <Label>Calories</Label>
            <Input type="number" value={form.calories} onChange={(e) => setForm({ ...form, calories: Number(e.target.value || 0) })} />
          </div>
          <div>
            <Label>Protein</Label>
            <Input type="number" value={form.protein} onChange={(e) => setForm({ ...form, protein: Number(e.target.value || 0) })} />
          </div>
          <div>
            <Label>Carbs</Label>
            <Input type="number" value={form.carbs} onChange={(e) => setForm({ ...form, carbs: Number(e.target.value || 0) })} />
          </div>
          <div>
            <Label>Fat</Label>
            <Input type="number" value={form.fat} onChange={(e) => setForm({ ...form, fat: Number(e.target.value || 0) })} />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={() => onSubmit(form)}>Save Meal</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryList({ title, items }: { title: string; items: { id: string; date: string; summary: string }[] }) {
  return (
    <Card className="glow-card">
      <CardHeader>
        <CardTitle>{title} History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && <div className="text-sm text-muted-foreground">No entries yet.</div>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between border rounded-md p-3">
            <div className="text-sm">{new Date(it.date).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{it.summary}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ProgressSection({ weights, onAddWeight, photos, onAddPhoto }: { weights: WeightEntry[]; onAddWeight: (w: number, bf?: number) => void; photos: Photo[]; onAddPhoto: (file: File) => void; }) {
  const [w, setW] = useState(70);
  const [bf, setBf] = useState<number | "">("");

  const chartData = useMemo(() =>
    [...weights].reverse().map((x) => ({
      date: new Date(x.date).toLocaleDateString(),
      weight: x.weight,
    })), [weights]);

  return (
    <div className="space-y-4">
      <Card className="glow-card">
        <CardHeader>
          <CardTitle>Body Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Weight (kg)</Label>
              <Input type="number" value={w} onChange={(e) => setW(Number(e.target.value || 0))} />
            </div>
            <div>
              <Label>Body fat %</Label>
              <Input type="number" value={bf as any} onChange={(e) => setBf(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => onAddWeight(w, typeof bf === "number" ? bf : undefined)}>Add</Button>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                <ReTooltip contentStyle={{ background: "hsl(222.2 84% 4.9%)", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
                <Line type="monotone" dataKey="weight" stroke="hsl(215 86% 55%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="glow-card">
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover-scale">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files && onAddPhoto(e.target.files[0])} />
            Add Photo
          </label>
          {photos.length === 0 && <div className="text-sm text-muted-foreground">No photos yet.</div>}
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <img key={p.id} src={p.dataUrl} alt="progress photo" className="rounded-md aspect-[3/4] object-cover" loading="lazy" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default Index;
