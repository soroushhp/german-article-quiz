import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import NOUNS from "./data/nouns.json";
import confetti from "canvas-confetti";
import { Howl } from "howler";
import { supabase } from "./supabase";

// ── Constants ──────────────────────────────────────────────
const ARTICLES = ["der", "die", "das"];
const DIFFICULTY_LABELS = { beginner: "Easy", intermediate: "Medium", advanced: "Hard", artikelgott: "Artikelgott" };
const nextDifficulty = {
  beginner: "intermediate",
  intermediate: "advanced",
  advanced: "artikelgott"
};
const GREEN = "#2E8B57";
const RED = "#D94A4A";
const ORANGE = "#FF7A00";

const UNLOCK_REQUIREMENTS = {
  intermediate: "30 streak in Easy ",
  advanced: "50 streak in Medium ",
  artikelgott: "75 streak in Hard "
};

// ── Helpers ────────────────────────────────────────────────
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function getHS(d) { try { return parseInt(localStorage.getItem(`hs_${d}`) || "0", 10); } catch { return 0; } }
function saveHS(d, v) { try { localStorage.setItem(`hs_${d}`, String(v)); } catch {} }

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function getDailyWords(words, count = 10) {
  const dateString = new Date().toISOString().slice(0, 10);
  const seed = hash(dateString);
  const random = mulberry32(seed);
  const result = [...words];
  const actualCount = Math.min(count, result.length);
  for (let i = 0; i < actualCount; i++) {
    const j = i + Math.floor(random() * (result.length - i));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.slice(0, actualCount);
}

const isDailyUnlocked = (difficulty) => {
  if (difficulty === "beginner") return true;

  if (difficulty === "intermediate")
    return dailyStatuses.beginner?.passed;

  if (difficulty === "advanced")
    return dailyStatuses.intermediate?.passed;

  if (difficulty === "artikelgott")
    return dailyStatuses.advanced?.passed;

  return false;
};

// ── Sounds ─────────────────────────────────────────────────
const sounds = {
  correct:       new Howl({ src: ["/sounds/correct.mp3"],       volume: 0.2, preload: true }),
  wrong:         new Howl({ src: ["/sounds/wrong.mp3"],         volume: 0.2, preload: true }),
  heartGain:     new Howl({ src: ["/sounds/heartgain.mp3"],     volume: 0.2, preload: true }),
  heartLose:     new Howl({ src: ["/sounds/heartlose.mp3"],     volume: 0.2, preload: true }),
  highscore:     new Howl({ src: ["/sounds/highscore.mp3"],     volume: 0.2, preload: true }),
  levelComplete: new Howl({ src: ["/sounds/levelcomplete.mp3"], volume: 0.2, preload: true }),
};

// ── Supabase ───────────────────────────────────────────────
async function saveScore(telegramId, username, difficulty, score) {
  const { data } = await supabase
    .from("leaderboard")
    .select("*")
    .eq("telegram_id", telegramId)
    .eq("difficulty", difficulty)
    .maybeSingle();

  if (!data) {
    await supabase.from("leaderboard").insert({ telegram_id: telegramId, username, difficulty, best_score: score });
    return;
  }
  if (score > data.best_score) {
    await supabase.from("leaderboard").update({ best_score: score, username, updated_at: new Date().toISOString() }).eq("id", data.id);
  }
}

async function getDailyStatuses(telegramId, date) {
  const { data, error } = await supabase
    .from("daily_challenges")
    .select("difficulty, score, passed, status")
    .eq("telegram_id", telegramId)
    .eq("date", date);

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}

async function loadHighScores(telegramId) {
  if (!telegramId) return;

  const { data } = await supabase
    .from("leaderboard")
    .select("difficulty,best_score")
    .eq("telegram_id", telegramId);

  const scores = {
    beginner: 0,
    intermediate: 0,
    advanced: 0,
    artikelgott: 0,
  };

  data?.forEach(row => {
    scores[row.difficulty] = row.best_score;
  });

  return scores;
}


async function migrateLocalScores(telegramId, username) {
  const difficulties = ["beginner", "intermediate", "advanced", "artikelgott"];
  for (const diff of difficulties) {
    const score = getHS(diff);
    if (score > 0) await saveScore(telegramId, username, diff, score);
  }
  localStorage.setItem("leaderboard_migrated", "true");
}

async function saveDailyProgress(data) {
  const { error } = await supabase
    .from("daily_challenges")
    .upsert(data, { onConflict: "telegram_id,date,difficulty" });

  if (error) console.error(error);
}

async function getDailyProgress(telegramId, date, difficulty) {
  const { data, error } = await supabase
    .from("daily_challenges")
    .select("*")
    .eq("telegram_id", telegramId)
    .eq("date", date)
    .eq("difficulty", difficulty)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

async function loadUnlockedDifficulties(telegramId) {
  const { data, error } = await supabase
    .from("user_unlocks")
    .select("difficulty")
    .eq("telegram_id", telegramId);

  if (error) {
    console.error(error);
    return {
      beginner: true,
      intermediate: false,
      advanced: false,
      artikelgott: false
    };
  }

  const unlocked = {
    beginner: true,
    intermediate: false,
    advanced: false,
    artikelgott: false
  };

  data.forEach(row => {
    unlocked[row.difficulty] = true;
  });

  return unlocked;
}


async function unlockDifficulty(telegramId, difficulty) {
  const { error } = await supabase
    .from("user_unlocks")
    .upsert(
      {
        telegram_id: telegramId,
        difficulty,
        unlocked: true,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "telegram_id,difficulty"
      }
    );

  if (error) console.error(error);
}

async function isDifficultyUnlocked(telegramId, difficulty) {
  const { data } = await supabase
    .from("user_unlocks")
    .select("unlocked")
    .eq("telegram_id", telegramId)
    .eq("difficulty", difficulty)
    .maybeSingle();

  return difficulty === "beginner" || !!data?.unlocked;
}


async function fetchLeaderboardData(diff, telegramId) {
  const { data: top10 } = await supabase
    .from("leaderboard")
    .select("*")
    .eq("difficulty", diff)
    .order("best_score", { ascending: false })
    .limit(10);

  if (!telegramId) return { top10: top10 || [], userRow: null, userRank: null };

  const { data: userRow } = await supabase
    .from("leaderboard")
    .select("*")
    .eq("telegram_id", telegramId)
    .eq("difficulty", diff)
    .maybeSingle();

  if (!userRow) return { top10: top10 || [], userRow: null, userRank: null };

  const { count } = await supabase
    .from("leaderboard")
    .select("*", { count: "exact", head: true })
    .eq("difficulty", diff)
    .gt("best_score", userRow.best_score);

  return { top10: top10 || [], userRow, userRank: count + 1 };
}

// ── App ────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("menu");
  const [mode, setMode] = useState("daily");

  const [dailyResults, setDailyResults] = useState([]);
  const [dailyPassed, setDailyPassed] = useState(false);
  const [dailyProgress, setDailyProgress] = useState({});
  const [unlockedLevels, setUnlockedLevels] = useState({
    beginner: true,
    intermediate: false,
    advanced: false,
    artikelgott: false
  });

  const [difficulty, setDifficulty] = useState(null);
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);

  const [streak, setStreak] = useState(0);
  const [previousBest, setPreviousBest] = useState(0);
  const [heartStreak, setHeartStreak] = useState(0);
  const [hearts, setHearts] = useState(3);

  const [highScores, setHighScores] = useState({
    beginner: 0,
    intermediate: 0,
    advanced: 0,
    artikelgott: 0
  });

  const PREREQ_MAP = {
    intermediate: "beginner",
    advanced:     "intermediate",
    artikelgott:  "advanced",
  };
  const LOCK_SUBTITLES = {
    intermediate: " Pass Easy first",
    advanced:     " Pass Medium first",
    artikelgott:  " Pass Hard first",
  };

  const [reviewAnswer, setReviewAnswer] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [isNewHigh, setIsNewHigh] = useState(false);
  const [isLevelComplete, setIsLevelComplete] = useState(false);

  const [finalScore, setFinalScore] = useState(0);

  const [answerHistory, setAnswerHistory] = useState([]);
  const [dailyLastMistake, setDailyLastMistake] = useState(null);
  const [heartNotification, setHeartNotification] = useState(null);
  const [showQuitPopup, setShowQuitPopup] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [userName, setUserName] = useState("");
  const [telegramId, setTelegramId] = useState(null);

  const menuInfo =
  mode === "daily"
    ? Object.values(dailyProgress ?? {}).some(p => p?.status === "completed")
      ? `New Daily Challenge in ${dailyCountdown}`
      : `Today's Challenge • ${new Date().toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric"
        })}`
    : Object.values(unlockedLevels ?? {}).every(Boolean)
      ? "Unlimited practice. Improve your best streaks."
      : "Unlock levels by reaching streaks.";

  // Leaderboard state
  const [lbTab, setLbTab]     = useState("beginner");
  const [lbData, setLbData]   = useState({ beginner: null, intermediate: null, advanced: null, artikelgott: null });
  const [lbLoading, setLbLoading] = useState(false);

  // Telegram haptic API
  const haptic = (type = "light") => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(type);
  };

  // Telegram user detection
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      setTimeout(async () => {
        const user = tg.initDataUnsafe?.user;
        if (user?.first_name) setUserName(user.first_name);
        if (user?.id) {
          const id = String(user.id);

          setTelegramId(id);

          const scores = await loadHighScores(id);
          setHighScores(scores);

          const unlocked = await loadUnlockedDifficulties(id);
          setUnlockedLevels(unlocked);

          loadDailyStatuses(id);

          const migrated = localStorage.getItem("leaderboard_migrated");
          if (!migrated) migrateLocalScores(id, user.first_name || "Anonymous");
        }
      }, 300);
    }
  }, []);

  const triggerHeartNotification = (type) => {
    setHeartNotification(type);
    setTimeout(() => setHeartNotification(null), 900);
  };

  // ── Leaderboard loading ────────────────────────────────
  const openLeaderboard = async () => {
    if (lbLoading) return;
    const initialTab = difficulty || "beginner";
    setScreen("leaderboard");
    setLbTab(initialTab);
    setLbLoading(true);
    const result = await fetchLeaderboardData(initialTab, telegramId);
    setLbData(prev => ({ ...prev, [initialTab]: result }));
    setLbLoading(false);
  };

  const switchTab = async (diff) => {
    setLbTab(diff);
    if (lbData[diff]) return;
    setLbLoading(true);
    const result = await fetchLeaderboardData(diff, telegramId);
    setLbData(prev => ({ ...prev, [diff]: result }));
    setLbLoading(false);
  };

  // ── Game control ───────────────────────────────────────
  const loadDailyStatuses = async (id = telegramId) => {
    if (!id) return;
    const today = new Date().toISOString().slice(0, 10);
    const rows = await getDailyStatuses(id, today);
    const map = {};
    rows.forEach(row => { map[row.difficulty] = row; });
    setDailyProgress(map);
  };

  const startDaily = async (diff) => {
    setShowQuitPopup(false);
    setSelected(null);
    setAnswerHistory([]);
    setReviewAnswer(null);
    setGameOver(false);
    setHeartNotification(null);

    setStreak(0);
    setHeartStreak(0);
    setHearts(3);

    const today = new Date().toISOString().slice(0, 10);
    const existing = await getDailyProgress(telegramId, today, diff);

    if (existing?.status === "in_progress") {
      setDailyResults(existing.results || []);
      setAnswerHistory(existing.answer_history || []);
      setDifficulty(diff);
      setQueue(getDailyWords(NOUNS[diff], 10));
      setIdx(existing.current_word || 0);
      await loadDailyStatuses();
      setScreen("game");
      return;
    }

    if (existing?.status === "completed") {
      await loadDailyStatuses();
      setScreen("menu");
      return;
    }

    await saveDailyProgress({
      telegram_id: telegramId,
      date: today,
      difficulty: diff,
      status: "in_progress",
      current_word: 0,
      score: 0,
      results: [],
      answer_history: [],
      completed: false,
      passed: false,
      last_played_at: new Date().toISOString()
    });

    setDailyResults([]);
    setDailyPassed(false);
    setDifficulty(diff);
    setQueue(getDailyWords(NOUNS[diff], 10));
    setIdx(0);
    await loadDailyStatuses();
    setScreen("game");
  };

  const startGame = (diff) => {
    setDifficulty(diff);
    setQueue(shuffle(NOUNS[diff]));
    setIdx(0);
    setReviewAnswer(null);
    setSelected(null);
    setShowQuitPopup(false);
    setStreak(0);
    setHeartStreak(0);
    setHearts(3);
    setAnswerHistory([]);
    setGameOver(false);
    setIsNewHigh(false);
    setIsLevelComplete(false);
    setHeartNotification(null);
    setScreen("game");
  };

  const handleDailyAnswer = async (isCorrect) => {
  const nextIdx = idx + 1;
  const nextResults = [...dailyResults, isCorrect];
  const score = nextResults.filter(Boolean).length;
  const isComplete = nextIdx >= queue.length;

  setDailyResults(nextResults);

  const updatedHistory = [
    ...answerHistory,
    {
      word: queue[idx].word,
      meaning: queue[idx].meaning,
      article: queue[idx].article,
      selected,
      correct: isCorrect
    }
  ];

  await saveDailyProgress({
    telegram_id: telegramId,
    date: new Date().toISOString().slice(0, 10),
    difficulty,
    status: isComplete ? "completed" : "in_progress",
    current_word: nextIdx,
    score,
    results: nextResults,
    answer_history: updatedHistory,
    completed: isComplete,
    passed: isComplete ? score >= 8 : false,
    last_played_at: new Date().toISOString()
  });

  if (isComplete) {
    await loadDailyStatuses();
    const lastMistake = [...updatedHistory].reverse().find(entry => !entry.correct) || null;
    setDailyLastMistake(lastMistake);
    setFinalScore(score);
    setDailyPassed(score >= 8);
    setGameOver(true);
    return;
  }

  setTimeout(() => {
    setIdx(nextIdx);
    setSelected(null);
  }, 600);
};

    const handleFreeAnswer = (isCorrect, selectedArticle) => {
        if (!isCorrect) {
          if (hearts <= 0) {
            endGameOver();
            return;
          }

          setHearts(h => h - 1);
          setHeartStreak(0);
          triggerHeartNotification("lose");

          setTimeout(() => {
            setReviewAnswer({
              selected: selectedArticle,
              article: queue[idx].article,
              word: queue[idx].word,
              meaning: queue[idx].meaning
            });
          }, 600);

          return;
        }

        const newStreak = streak + 1;
        const newHeartStreak = heartStreak + 1;

        setStreak(newStreak);
        setHeartStreak(newHeartStreak);

        if (newHeartStreak % 10 === 0 && hearts < 3) {
          setHearts(h => h + 1);
          triggerHeartNotification("gain");
        }

        const nextIdx = idx + 1;

        if (nextIdx >= queue.length) {
          endLevelComplete(newStreak);
          return;
        }

        setTimeout(() => {
          setIdx(nextIdx);
          setSelected(null);
        }, 600);
    };

  const handleAnswer = (art) => {
    if (selected !== null || gameOver) return;

    const isCorrect = art === queue[idx].article;

    setAnswerHistory(prev => [
      ...prev,
      {
        word: queue[idx].word,
        meaning: queue[idx].meaning,
        article: queue[idx].article,
        selected: art,
        correct: isCorrect
      }
    ]);

    const isHeartMoment = isCorrect && (heartStreak + 1) % 10 === 0 && hearts < 3;
    const isHeartLose   = !isCorrect && hearts > 0;

    setSelected(art);

    if (isCorrect) haptic("light")
    else haptic("medium");

    if (isHeartMoment)    { sounds.heartGain.play(); haptic("rigid"); }
    else if (isHeartLose) { sounds.heartLose.play(); haptic("heavy"); }
    else                  { sounds[isCorrect ? "correct" : "wrong"].play(); }

    if (mode === "daily") handleDailyAnswer(isCorrect);
    else handleFreeAnswer(isCorrect, art);
  };

  const handleContinue = () => {
    setReviewAnswer(null);

    const nextIdx = idx + 1;

    if (nextIdx >= queue.length) {
      endLevelComplete(streak);
      return;
    }

    setIdx(nextIdx);
    setSelected(null);
  };


  const endGameOver = async () => {
    const prev = highScores[difficulty];
    setPreviousBest(prev);

    const isNew = streak > prev;
    if (isNew) {
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } });
      sounds.highscore.play();

      if (telegramId) {
        await saveScore(telegramId, userName || "Anonymous", difficulty, streak);
        const scores = await loadHighScores(telegramId);
        setHighScores(scores);
      }
    }
    checkAndUnlock(difficulty, streak);
    setFinalScore(streak);
    setIsNewHigh(isNew);
    setGameOver(true);
  };


  const checkAndUnlock = async (diff, score) => {
    if (!telegramId) return;
    if (diff === "beginner"    && score >= 30) await unlockDifficulty(telegramId, "intermediate");
    if (diff === "intermediate" && score >= 50) await unlockDifficulty(telegramId, "advanced");
    if (diff === "advanced"    && score >= 75) await unlockDifficulty(telegramId, "artikelgott");
    const unlocked = await loadUnlockedDifficulties(telegramId);
    setUnlockedLevels(unlocked);
  };


  const endLevelComplete = async (finalStr) => {
    sounds.levelComplete.play();
    confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } });

    if (telegramId) {
      await saveScore(telegramId, userName || "Anonymous", difficulty, finalStr);
      const scores = await loadHighScores(telegramId);
      setHighScores(scores);
    }

    await checkAndUnlock(difficulty, finalStr);

    setFinalScore(finalStr);
    setIsLevelComplete(true);
    setGameOver(true);
  };

  const shareScore = () => {
    const text = `🔥 I scored ${finalScore} on ${DIFFICULTY_LABELS[difficulty]} in Article Fever!\nCan you beat me?`;
    const url  = `https://t.me/ArticleFever_bot`;
    const tg   = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
    } else {
      navigator.clipboard.writeText(`${text}\n${url}`);
      alert("Score copied to clipboard!");
    }
  };

  // ── Styles ─────────────────────────────────────────────
  const current = queue[idx];

  const btnStyle = (art) => {
    if (!selected) return { bg: "#FFFFFF", color: "#2D2D2D", border: "2px solid #D8D1C7" };
    const isCorrect = art === queue[idx].article;
    const isChosen  = art === selected;
    if (isCorrect)              return { bg: GREEN, color: "#FFFFFF", border: `2px solid ${GREEN}` };
    if (isChosen && !isCorrect) return { bg: RED,   color: "#FFFFFF", border: `2px solid ${RED}` };
    return { bg: "#FFFFFF", color: "#767676", border: "2px solid #D8D1C7" };
  };

  const modalTitle = isLevelComplete ? "Level Complete!" : isNewHigh ? "New High Score!" : "Streak Broken!";

  const menuBtnStyle = {
    padding: "16px 24px",
    borderRadius: 48,
    border: "2px solid #D8D1C7",
    background: "#FFFFFF",
    color: "#2D2D2D",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    transition: "all 0.3s",
    width: "100%",
  };

  // ── Leaderboard helpers ────────────────────────────────
  const currentLbData   = lbData[lbTab];
  const isUserInTop10   = currentLbData?.top10?.some(p => p.telegram_id === telegramId);
  const correctCount    = answerHistory.filter(a => a.correct).length;
  const incorrectCount  = answerHistory.length - correctCount;

// ── Render ─────────────────────────────────────────────
  return (
    <div style={{ width: "100%", minHeight: "100vh", background: "#FFFAF4", color: "#2D2D2D", fontFamily: "'Nunito', sans-serif", colorScheme: "light" }}>

      {/* Help & Instructions*/}
      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(45,45,45,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16
          }}
        >
          <motion.div
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            style={{
              background: "#FFFFFF",
              borderRadius: 24,
              padding: "32px 24px",
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 8px 40px rgba(0,0,0,0.12)"
            }}
          >
            <h2 style={{ margin: "0 0 20px", color: "#2D2D2D" }}>
              How to Play
            </h2>

            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 8px", color: ORANGE }}>
                📅 Daily
              </h3>

              <p style={{ margin: 0, color: "#767676", lineHeight: 1.6 }}>
                • 10 words per level<br />
                • Score 8/10 or higher to unlock the next level<br />
                • Your progress is saved automatically<br />
                • Each level can only be completed once per day
              </p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 8px", color: ORANGE }}>
                ⚡ Survival
              </h3>

              <p style={{ marginBottom: 48, color: "#767676", lineHeight: 1.6 }}>
                • Unlimited words<br />
                • Start with 3 hearts ❤️<br />
                • Lose a heart for each mistake<br />
                • Earn 1 heart every 10 correct answers<br />
                • Game ends when you run out of hearts
              </p>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              style={{
                width: "100%",
                padding: "14px 0",
                borderRadius: 48,
                border: `2px solid ${GREEN}`,
                background: GREEN,
                color: "#FFFFFF",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Got it
            </button>
          </motion.div>
        </div>
      )}
      
      
      
      {/* ── MENU ── */}
      {screen === "menu" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 32px", boxSizing: "border-box" }}>
          <div style={{ maxWidth: 420, width: "100%" }}>

            {/* Top bar */}
            <div style={{ position: "fixed", top: 16, right: 16, display: "flex", gap: 8, zIndex: 10 }}>
              <motion.button
                onClick={() => { haptic("light"); openLeaderboard(); }}
                whileTap={{ scale: 0.95, backgroundColor: "#fff6eb" }}
                style={{ width: 36, height: 36, border: "2px solid #FF7A00", background: "transparent", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontSize: 20 }}>
                <img src="/icons/podium.svg" width={28} height={28} />
              </motion.button>

              <motion.button
                onClick={() => setShowHelp(true)}
                whileTap={{ scale: 0.95, backgroundColor: "#D8D1C7" }}
                style={{ width: 36, height: 36, border: "2px solid #D8D1C7", background: "transparent", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontSize: 20, fontWeight: 800 }}>
                <img src="/icons/help.svg" width={28} height={28} />
              </motion.button>
            </div>

            {/* Logo */}
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <img src="/favicon.svg" style={{ width: 64, height: 64, marginBottom: 12 }} />
              <h1 style={{ fontSize: 36, fontWeight: 800, color: "#2D2D2D", letterSpacing: "-1px", margin: 0 }}>
                Article Fever
              </h1>
            </div>

            {/* Mode toggle */}
            <div style={{ display: "flex", background: "#FFFFFF", border: "2px solid #D8D1C7", borderRadius: 48, padding: 4, marginBottom: 24, position: "relative" }}>
              {["daily", "free"].map(m => (
                <button
                  key={m}
                  onClick={() => { haptic("light"); setMode(m); }}
                  style={{ flex: 1, padding: "12px 0", border: "none", borderRadius: 48, background: "transparent", color: mode === m ? "#FFFFFF" : "#767676", fontSize: 15, fontWeight: 800, cursor: "pointer", position: "relative", zIndex: 1 }}
                >
                  {mode === m && (
                    <motion.div
                      layoutId="homeModeTab"
                      style={{ position: "absolute", inset: 0, background: ORANGE, borderRadius: 48, zIndex: -1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  {m === "daily"
                    ? <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4
                        }}
                      >
                        <img
                          src="/images/daily.png"
                          style={{ width: 20, height: 20, filter: mode === m ? "brightness(0) invert(1)" : "none" }}
                        />
                        Daily
                      </span>
                    : <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4
                        }}
                      >
                        <img
                          src="/icons/flame.svg"
                          style={{ width: 20, height: 20, filter: mode === m ? "brightness(0) invert(1)" : "none" }}
                        />
                        Survival
                      </span>}
                </button>
              ))}
            </div>


            <AnimatePresence mode="wait">
              <motion.p
                key={mode}
                initial={{ opacity: 0, x: mode === "daily" ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === "daily" ? 20 : -20 }}
                transition={{ duration: 0.2 }}
                style={{
                  margin: "4px 0 14px",
                  textAlign: "center",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#767676"
                }}
              >
                {menuInfo}
              </motion.p>
            </AnimatePresence>

            {/* Level buttons */}
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: mode === "daily" ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === "daily" ? 20 : -20 }}
                transition={{ duration: 0.2 }}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                {mode === "daily" ? (
                  ["beginner", "intermediate", "advanced", "artikelgott"].map(d => {
                    const prereq      = PREREQ_MAP[d];
                    const prereqEntry = prereq ? dailyProgress[prereq] : null;
                    const prereqPassed = !prereq || prereqEntry?.passed;
                    const isLocked    = !prereqPassed;

                    const status      = dailyProgress[d]?.status;
                    const score       = dailyProgress[d]?.score;
                    const isCompleted = status === "completed";
                    const isInProgress = status === "in_progress";
                    const isDisabled  = isLocked || isCompleted;
                    const isInteractive = !isDisabled;
                    const isPassed = dailyProgress[d]?.passed;

                    let subtitle;
                    if (isLocked)
                    subtitle = (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <img src="/icons/lock.svg" width={16} height={16} />
                        <span>{LOCK_SUBTITLES[d]}</span>
                      </span>
                    );
                    else if (isCompleted)
                    subtitle = (
                      <span style={{ color: isPassed ? GREEN : RED }}>
                        {isPassed ? "✓" : "✗"} {score}/10
                      </span>
                    );
                    else if (isInProgress)
                      subtitle = (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6
                          }}
                        >
                          <img src="/icons/continue.svg" width={16} height={16} />
                          <span>Continue ({dailyProgress[d]?.current_word}/10)</span>
                        </span>
                      );
                    else
                        subtitle = (
                              <span
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#3f3f3e" }}
                              >
                                <img src="/icons/sparkles.svg" width={16} height={16} />
                                <span>Ready to Play</span>
                              </span>
                            );

                    return (
                      <motion.button
                        key={d}
                        disabled={isDisabled}
                        onClick={() => {
                          if (!isInteractive) return;
                          haptic("light");
                          setTimeout(() => startDaily(d), 120);
                        }}
                        whileTap={{ scale: isInteractive ? 0.97 : 1 }}
                        whileHover={isInteractive ? { scale: 1.02, background: "#FDEFD8" } : {}}
                        style={{
                          ...menuBtnStyle,
                          opacity: isDisabled ? 0.6 : 1,
                          cursor: isInteractive ? "pointer" : "default",
                          ...(d === "artikelgott" && { background: "#fff6eb", border: `2px solid ${ORANGE}` })
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {d === "artikelgott" && (
                            <img src="/icons/crown.svg" width={20} height={20} />
                          )}
                          {d === "artikelgott" ? "Artikelgott" : DIFFICULTY_LABELS[d]}
                        </span>
                        <span style={{ fontSize: 14, color: "#ADADAD", fontWeight: 700 }}>
                          {subtitle}
                        </span>
                      </motion.button>
                    );
                  })
                ) : (
                  ["beginner", "intermediate", "advanced", "artikelgott"].map(d => (
                    <motion.button
                      key={d}
                      onClick={() => {
                        if (!unlockedLevels[d]) return;

                        haptic("light");
                        setTimeout(() => startGame(d), 120);
                      }}
                      whileTap={{ scale: 0.97 }}
                      whileHover={
                        unlockedLevels[d]
                          ? { scale: 1.02, background: "#FDEFD8" }
                          : {}
                      }
                      disabled={!unlockedLevels[d]}
                      style={{
                        opacity: unlockedLevels[d] ? 1 : 0.6,
                        ...menuBtnStyle,
                        cursor: unlockedLevels[d] ? "pointer" : "default",
                        ...(d === "artikelgott" && {
                          background: "#fff6eb",
                          border: `2px solid ${ORANGE}`
                        })
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        {d === "artikelgott" && (
                          <img src="/icons/crown.svg" width={20} height={20} />
                        )}
                        {d === "artikelgott" ? "Artikelgott" : DIFFICULTY_LABELS[d]}
                      </span>
                      {unlockedLevels[d] ? (
                        <span style={{ fontSize: 14, color: "#767676" }}>
                          Best: {highScores[d]}
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            color: "#767676",
                            fontSize: 14
                          }}
                        >
                          <img src="/icons/lock.svg" width={16} height={16} />
                          <span>{UNLOCK_REQUIREMENTS[d]}</span>
                        </span>
                      )}
                    </motion.button>
                  ))
                )}
              </motion.div>
            </AnimatePresence>

          </div>
        </div>
      )}

      {/* ── LEADERBOARD ── */}
      {screen === "leaderboard" && (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 480, margin: "0 auto", boxSizing: "border-box" }}>

          {/* Header */}
          <div style={{ flexShrink: 0, background: "#FFFAF4", padding: "24px 16px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
              <motion.button
                onClick={() => { haptic("light"); setScreen("menu"); }}
                whileTap={{ scale: 0.95, backgroundColor: "#E6E1DA" }}
                style={{ width: 40, height: 40, border: "none", background: "transparent", borderRadius: "50%", color: "#767676", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20 12H4M10 18L4 12L10 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </motion.button>
              <h1 style={{ margin: "0 0 0 12px", fontSize: 24, fontWeight: 800, color: "#2D2D2D" }}>Leaderboard</h1>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", background: "#FFFFFF", border: "2px solid #D8D1C7", borderRadius: 48, padding: 4, position: "relative" }}>
              {["beginner", "intermediate", "advanced", "artikelgott"].map(d => (
                <button
                  key={d}
                  onClick={() => { haptic("light"); switchTab(d); }}
                  style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 48, background: "transparent", color: lbTab === d ? "#FFFFFF" : "#767676", fontSize: 14, fontWeight: 800, cursor: "pointer", position: "relative", zIndex: 1 }}>
                  {lbTab === d && (
                    <motion.div
                      layoutId="leaderboardTab"
                      style={{ position: "absolute", inset: 0, background: ORANGE, borderRadius: 48, zIndex: -1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable list */}
          {lbLoading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                style={{ width: 32, height: 32, border: `3px solid #E6E1DA`, borderTop: `3px solid ${ORANGE}`, borderRadius: "50%" }}
              />
            </div>
          ) : currentLbData ? (
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
                {currentLbData.top10.length === 0 ? (
                  <p style={{ textAlign: "center", color: "#ADADAD", marginTop: 48 }}>No scores yet. Be the first!</p>
                ) : (
                  currentLbData.top10.map((player, i) => {
                    const isMe = player.telegram_id === telegramId;
                    return (
                      <div
                        key={player.id}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 16, marginBottom: 4, background: isMe ? "#FFF4E8" : "#FFFFFF", border: `2px solid ${isMe ? ORANGE : "#F0EBE3"}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: i < 3 ? ORANGE : "#ADADAD", width: 24 }}>
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                          </span>
                          <span style={{ fontSize: 15, fontWeight: isMe ? 800 : 600, color: "#2D2D2D" }}>
                            {player.username || "Anonymous"} {isMe ? "(you)" : ""}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <img src="/icons/flame.svg" style={{ width: 16, height: 16 }} />
                          <span style={{ fontSize: 15, fontWeight: 800, color: isMe ? ORANGE : "#2D2D2D" }}>{player.best_score}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pinned bottom — only when user is outside top 10 */}
              {!isUserInTop10 && (
                <div style={{ flexShrink: 0, padding: "8px 16px 32px", borderTop: "1px solid #F0EBE3" }}>
                  {currentLbData.userRow ? (
                    <>
                      <div style={{ textAlign: "center", color: "#ADADAD", fontSize: 18, padding: "4px 0 8px" }}>•••</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 16, background: "#FFF4E8", border: `2px solid ${ORANGE}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: ORANGE, width: 24 }}>{currentLbData.userRank}.</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "#2D2D2D" }}>
                            {currentLbData.userRow.username || "Anonymous"} (you)
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <img src="/images/streak.png" style={{ width: 20, height: 20 }} />
                          <span style={{ fontSize: 15, fontWeight: 800, color: ORANGE }}>{currentLbData.userRow.best_score}</span>
                        </div>
                      </div>
                    </>
                  ) : telegramId ? (
                    <p style={{ textAlign: "center", color: "#ADADAD", fontSize: 14, padding: "12px 0", margin: 0 }}>
                      You haven't played this level yet.
                    </p>
                  ) : null}
                </div>
              )}
            </>
          ) : null}

        </div>
      )}

      {/* ── SESSION REVIEW ── */}
      {screen === "review" && (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto", boxSizing: "border-box" }}>

          {/* Fixed header */}
          <div style={{ flexShrink: 0, padding: "24px 16px 12px", background: "#FFFAF4" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <motion.button
                onClick={() => { setScreen("game"); setGameOver(true); }}
                whileTap={{ scale: 0.95, backgroundColor: "#E6E1DA" }}
                style={{ width: 40, height: 40, border: "none", background: "transparent", borderRadius: "50%", color: "#767676", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20 12H4M10 18L4 12L10 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </motion.button>
              <h1 style={{ margin: "0 0 0 12px", fontSize: 24, fontWeight: 800, color: "#2D2D2D" }}>Session Review</h1>
            </div>
          </div>

          {/* Scrollable content with bottom fade */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <div style={{ height: "100%", overflowY: "auto", padding: "12px 16px 48px" }}>

              {/* Wrong answers */}
              {incorrectCount > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 3L13 13M13 3L3 13" stroke={RED} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span style={{ fontSize: 16, fontWeight: 800, color: RED, textTransform: "uppercase", letterSpacing: 1 }}>
                      {incorrectCount} mistake{incorrectCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {answerHistory.filter(a => !a.correct).map((answer, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFF0F0", border: "2px solid " + RED, borderRadius: 16, padding: "8px 14px", marginBottom: 4 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
                          <span style={{ color: RED }}>{answer.selected}</span>
                          <span style={{ color: "#2D2D2D" }}> {answer.word}</span>
                          <span style={{ color: "#ADADAD" }}> → </span>
                          <span style={{ color: GREEN }}>{answer.article}</span>
                          <span style={{ color: "#2D2D2D" }}> {answer.word}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#2D2D2D", fontWeight: 600 }}>{answer.meaning}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Correct answers */}
              {correctCount > 0 && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8L6 12L14 4" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: 16, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1 }}>
                      {correctCount} correct
                    </span>
                  </div>
                  {answerHistory.filter(a => a.correct).map((answer, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFFFFF", border: "2px solid #F0EBE3", borderRadius: 16, padding: "8px 14px", marginBottom: 4 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#2D2D2D", lineHeight: 1.3 }}>
                          {answer.article} {answer.word}
                        </div>
                        <div style={{ fontSize: 12, color: "#2D2D2D", fontWeight: 600 }}>{answer.meaning}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
            {/* Bottom fade overlay */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 64, background: "linear-gradient(to bottom, transparent, #FFFAF4)", pointerEvents: "none" }} />
          </div>

        </div>
      )}

      {/* ── GAME ── */}
      {screen === "game" && current && (
        <motion.div
          initial={{ y: "100%", opacity: 0.8 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div style={{ width: "100%", height: "100vh", paddingTop: 152, paddingBottom: 98, paddingLeft: 16, paddingRight: 16, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>

            {/* Top bar */}
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, background: "#FFFAF4", zIndex: 10, padding: "16px 16px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <button
                  onClick={() => setShowQuitPopup(true)}
                  style={{ border: "none", background: "transparent", fontSize: 32, color: "#767676", cursor: "pointer", lineHeight: 1, padding: 12, paddingLeft: 0 }}>
                  ×
                </button>
                <span style={{ fontSize: 14, color: "#767676", fontWeight: 600 }}>
                  {mode === "daily"
                    ? `${DIFFICULTY_LABELS[difficulty]} • ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : `${DIFFICULTY_LABELS[difficulty]} • Best: ${highScores[difficulty]}`}
                </span>
              </div>

              {mode === "free" ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {[1, 2, 3].map(n => (
                        <img key={n} src="/icons/heart.svg" style={{ width: 32, height: 32, opacity: n <= hearts ? 1 : 0.25 }} />
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <img src="/icons/flame.svg" style={{ width: 32, height: 32 }} />
                      <span style={{ fontSize: 28, fontWeight: 700, color: ORANGE }}>{streak}</span>
                    </div>
                  </div>
                  <div style={{ width: "100%", height: 6, background: "#E6E1DA", borderRadius: 999 }}>
                    <div style={{ height: "100%", width: `${hearts === 3 ? 100 : (heartStreak % 10) * 10}%`, background: GREEN, borderRadius: 999, transition: "width 0.3s ease" }} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#767676" }}>
                      {dailyResults.filter(Boolean).length} / 10
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} style={{ flex: 1, height: 8, borderRadius: 999, background: "#E6E1DA", overflow: "hidden" }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: dailyResults[i] !== undefined ? "100%" : "0%" }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          style={{ height: "100%", borderRadius: 999, background: dailyResults[i] === true ? GREEN : RED }}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Heart notification */}
            <AnimatePresence>
              {heartNotification && (
                <div style={{ position: "fixed", top: 152, left: 0, right: 0, bottom: 98, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
                  <motion.div
                    key={heartNotification}
                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -20 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    style={{ display: "flex", alignItems: "center", gap: 10, background: heartNotification === "gain" ? "rgba(46,139,87,0.12)" : "rgba(217,74,74,0.10)", borderRadius: 24, padding: "16px 28px" }}>
                    <img src="/images/heart.png" style={{ width: 64, height: 64 }} />
                    <span style={{ fontSize: 42, fontWeight: 800, color: heartNotification === "gain" ? GREEN : RED }}>
                      {heartNotification === "gain" ? "+1" : "-1"}
                    </span>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Word card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                style={{ width: "100%", maxWidth: 448, margin: "0 auto" }}>
                <div style={{ background: "#FFFFFF", borderRadius: 24, boxShadow: "0 4px 16px rgba(0,0,0,0.06)", padding: "32px 16px", textAlign: "center", height: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>

                  {reviewAnswer ? (
                    <>
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                      <h3 style={{ fontSize: 14, color: "#767676", marginTop: -6, marginBottom: 28 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <img src="/icons/wrong.svg" width={16} height={16} />
                          <span>You made a mistake</span>
                          <img src="/icons/wrong.svg" width={16} height={16} />
                        </span>
                      </h3>
                        <div>
                          <h3 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: GREEN }}>
                            {reviewAnswer.article} {reviewAnswer.word}
                          </h3>
                          <p style={{ fontSize: 16, fontWeight: 600, color: "#ADADAD" }}>
                            ({reviewAnswer.meaning})
                          </p>
                        </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                        <div>
                          <p style={{ marginBottom: -4, color: "#767676", fontSize: 12 }}>You chose:</p>
                          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#767676" }}>
                            {reviewAnswer.selected} {reviewAnswer.word}
                          </h3>
                        </div>

                      </div>
                    </div>
                    </>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontSize: 11, color: "#ADADAD", textTransform: "uppercase", letterSpacing: 1.5 }}>
                        What is the article for...
                      </p>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                        <h2 style={{ margin: 0, fontSize: current.word.length > 15 ? 32 : current.word.length > 10 ? 36 : current.word.length > 8 ? 40 : 48, fontWeight: 800, color: "#2D2D2D", wordBreak: "break-word", lineHeight: 1.1 }}>
                          {current.word}
                        </h2>

                        <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#ADADAD" }}>
                          ({current.meaning})
                        </p>
                      </div>

                      <div />
                    </>
                  )}

                </div>
              </motion.div>
            </AnimatePresence>

            {/* Article buttons */}
            <div style={{ position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 448, display: "flex", gap: 8 }}>
              {reviewAnswer ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleContinue}
                  style={{
                    width: "100%",
                    padding: "16px 0",
                    borderRadius: 48,
                    border: "2px solid #D8D1C7",
                    background: "#FFFFFF",
                    color: "#2D2D2D",
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  Next Word
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 12H20M14 6L20 12L14 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                </motion.button>
              ) : (
                ARTICLES.map(art => {
                  const { bg, color, border } = btnStyle(art);
                  return (
                    <motion.button
                      key={art}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleAnswer(art)}
                      style={{
                        flex: 1,
                        padding: "16px 0",
                        borderRadius: 48,
                        border,
                        background: bg,
                        color,
                        fontSize: 22,
                        fontWeight: 700,
                        cursor: selected ? "default" : "pointer",
                        transition: "background 0.15s, color 0.15s"
                      }}
                    >
                      {art}
                    </motion.button>
                  );
                })
              )}
            </div>

            {/* Quit popup */}
            {showQuitPopup && (
              <div
                onClick={() => setShowQuitPopup(false)}
                style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
                <motion.div
                  onClick={e => e.stopPropagation()}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  style={{ background: "#FFFFFF", borderRadius: 24, padding: "36px 28px", maxWidth: 320, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.12)" }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🤔</div>
                  <h2 style={{ margin: "0 0 12px", fontSize: 24, color: "#2D2D2D" }}>Quit game?</h2>
                  <p style={{ color: "#767676", fontSize: 14, marginBottom: 28 }}>
                    {mode === "daily" ? "Your progress will be saved." : "Your current streak will be lost."}
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    {mode === "daily" ? (
                      <>
                        <button
                          onClick={() => setShowQuitPopup(false)}
                          style={{ flex: 1, padding: "13px 0", borderRadius: 24, border: `2px solid ${GREEN}`, background: GREEN, color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                          Keep Playing
                        </button>
                        <button
                          onClick={() => setScreen("menu")}
                          style={{ flex: 1, padding: "13px 0", borderRadius: 24, border: "2px solid #D8D1C7", background: "#FFFFFF", color: "#2D2D2D", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                          Save & Quit
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setShowQuitPopup(false)}
                          style={{ flex: 1, padding: "13px 0", borderRadius: 24, border: "2px solid #D8D1C7", background: "#FFFFFF", color: "#2D2D2D", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                          Keep Playing
                        </button>
                        <button
                          onClick={() => setScreen("menu")}
                          style={{ flex: 1, padding: "13px 0", borderRadius: 24, border: `2px solid ${RED}`, background: RED, color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                          Quit
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              </div>
            )}

            {/* Game over modal */}
            {gameOver && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  style={{ background: "#FFFFFF", borderRadius: 24, padding: "48px 36px", maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.12)" }}>

                  {mode === "daily" ? (
                    <>
                      <div style={{ fontSize: 48, fontWeight: 800, color: ORANGE, lineHeight: 1, marginBottom: 12 }}>
                        {finalScore}/10
                      </div>
                      <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#2D2D2D" }}>
                        {finalScore === 10
                          ? "Congrats! You did a perfect job!"
                          : dailyPassed
                          ? `Congrats! You passed ${DIFFICULTY_LABELS[difficulty]}.`
                          : "Oh no! Come back tomorrow for a new challenge!"}
                      </h2>
                      <p style={{ color: "#767676", fontSize: 13, marginBottom: 20 }}>
                        {DIFFICULTY_LABELS[difficulty]} • {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                      <div
                        onClick={() => setScreen("review")}
                        style={{ background: "#FFF4E8", borderRadius: 16, padding: "14px 16px", marginBottom: 24, cursor: "pointer", border: `1px solid ${ORANGE}`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                        {dailyLastMistake ? (
                          <>
                            <p style={{ fontSize: 12, color: "#767676", marginBottom: 4 }}>Last mistake</p>
                            <div style={{ fontSize: 15, color: RED, fontWeight: 700 }}>✗ {dailyLastMistake.selected} {dailyLastMistake.word}</div>
                            <div style={{ fontSize: 15, color: GREEN, fontWeight: 700 }}>✓ {dailyLastMistake.article} {dailyLastMistake.word}</div>
                            <p style={{ fontSize: 14, color: ORANGE, marginTop: 8, fontWeight: 700 }}>Review answers →</p>
                          </>
                        ) : (
                          <>
                            <p style={{ fontSize: 15, color: GREEN, fontWeight: 700, margin: 0 }}>✓ No mistakes</p>
                            <p style={{ fontSize: 14, color: ORANGE, marginTop: 8, fontWeight: 700 }}>Review answers →</p>
                          </>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {dailyPassed && difficulty !== "artikelgott" && (
                          <button
                            onClick={() => {
                              const next = nextDifficulty[difficulty];
                              if (!next) return;

                              setGameOver(false);
                              startDaily(next);
                            }}
                            style={{ padding: "14px 0", borderRadius: 48, border: `2px solid ${GREEN}`, background: GREEN, color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                            Play Next Level
                          </button>
                        )}
                        <button
                          onClick={shareScore}
                          style={{ padding: "14px 0", borderRadius: 48, border: `2px solid ${ORANGE}`, background: ORANGE, color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                          Share Score
                        </button>
                        <button
                          onClick={() => setScreen("menu")}
                          style={{ padding: "14px 0", borderRadius: 48, border: "2px solid #D8D1C7", background: "#FFFFFF", color: "#2D2D2D", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                          Home
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {isNewHigh && (
                        <div style={{ color: ORANGE, fontWeight: 800, fontSize: 16, marginBottom: 12 }}>🏆 NEW HIGH SCORE!</div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                        <img src="/images/streak.png" style={{ width: 56, height: 56 }} />
                        <div style={{ fontSize: 64, fontWeight: 800, color: ORANGE, lineHeight: 1 }}>{finalScore}</div>
                      </div>
                      <h2 style={{ margin: "0 0 8px", fontSize: 24, color: "#2D2D2D" }}>{modalTitle}</h2>
                      <p style={{ color: "#767676", fontSize: 13, marginBottom: 16 }}>
                        {DIFFICULTY_LABELS[difficulty]} •{" "}
                        {isLevelComplete
                          ? `All ${queue.length} words completed!`
                          : isNewHigh
                          ? `Previous best: ${previousBest}`
                          : `Best: ${highScores[difficulty]}`}
                      </p>
                      {!isLevelComplete && (
                        <div
                          onClick={() => setScreen("review")}
                          style={{ background: "#FFF4E8", borderRadius: 16, padding: "14px 16px", marginBottom: 24, cursor: "pointer", border: `1px solid ${ORANGE}`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", transition: "all 0.15s" }}>
                          <p style={{ fontSize: 12, color: "#767676", marginBottom: 4 }}>Last mistake</p>
                          <div style={{ fontSize: 15, color: RED, fontWeight: 700 }}>✗ {selected} {current.word}</div>
                          <div style={{ fontSize: 15, color: GREEN, fontWeight: 700 }}>✓ {current.article} {current.word}</div>
                          <p style={{ fontSize: 14, color: ORANGE, marginTop: 8, fontWeight: 700 }}>Review all answers →</p>
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <button
                          onClick={() => startGame(difficulty)}
                          style={{ padding: "14px 0", borderRadius: 48, border: `2px solid ${GREEN}`, background: GREEN, color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                          Play Again
                        </button>
                        <button
                          onClick={shareScore}
                          style={{ padding: "14px 0", borderRadius: 48, border: `2px solid ${ORANGE}`, background: ORANGE, color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                          Share Score
                        </button>
                        <button
                          onClick={() => setScreen("menu")}
                          style={{ padding: "14px 0", borderRadius: 48, border: "2px solid #D8D1C7", background: "#FFFFFF", color: "#2D2D2D", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                          Home
                        </button>
                      </div>
                    </>
                  )}

                </motion.div>
              </div>
            )}

          </div>
        </motion.div>
      )}

    </div>
  );
}