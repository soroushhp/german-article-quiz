import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import NOUNS from "./data/nouns.json";
import confetti from "canvas-confetti";
import { Howl } from "howler";

const ARTICLES = ["der", "die", "das"];
const DIFFICULTY_LABELS = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const GREEN = "#13AB5E";
const RED = "#FF0000";

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function getHS(d) { try { return parseInt(localStorage.getItem(`hs_${d}`) || "0", 10); } catch { return 0; } }
function saveHS(d, v) { try { localStorage.setItem(`hs_${d}`, String(v)); } catch {} }

const sounds = {
  correct: new Howl({ src: ["/sounds/correct.mp3"], volume: 0.2, preload: true }),
  wrong: new Howl({ src: ["/sounds/wrong.mp3"], volume: 0.2, preload: true }),
  heartGain: new Howl({ src: ["/sounds/heartgain.mp3"], volume: 0.2, preload: true }),
  heartLose: new Howl({ src: ["/sounds/heartlose.mp3"], volume: 0.2, preload: true }),
  highscore: new Howl({ src: ["/sounds/highscore.mp3"], volume: 0.2, preload: true }),
  levelComplete: new Howl({ src: ["/sounds/levelcomplete.mp3"], volume: 0.2, preload: true }),
};

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [difficulty, setDifficulty] = useState(null);
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [streak, setStreak] = useState(0);
  const [highScores, setHighScores] = useState({ beginner: getHS("beginner"), intermediate: getHS("intermediate"), advanced: getHS("advanced") });
  const [gameOver, setGameOver] = useState(false);
  const [isNewHigh, setIsNewHigh] = useState(false);
  const [isLevelComplete, setIsLevelComplete] = useState(false);
  const [finalStreak, setFinalStreak] = useState(0);
  const [hearts, setHearts] = useState(0);
  const [heartNotification, setHeartNotification] = useState(null);
  const [showQuitPopup, setShowQuitPopup] = useState(false);
  const [userName, setUserName] = useState("");

  const triggerHeartNotification = (type) => {
    setHeartNotification(type);
    setTimeout(() => setHeartNotification(null), 900);
  };

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      setTimeout(() => {
        const user = tg.initDataUnsafe?.user;
        if (user?.first_name) setUserName(user.first_name);
      }, 300);
    }
  }, []);

  const startGame = (diff) => {
    setDifficulty(diff);
    setQueue(shuffle(NOUNS[diff]));
    setIdx(0);
    setSelected(null);
    setStreak(0);
    setGameOver(false);
    setIsNewHigh(false);
    setIsLevelComplete(false);
    setHearts(3);
    setHeartNotification(null);
    setShowQuitPopup(false);
    setScreen("game");
  };

  const handleAnswer = (art) => {
    if (selected !== null || gameOver) return;

    const isCorrect = art === queue[idx].article;
    const isHeartMoment = isCorrect && (streak + 1) % 10 === 0;
    const isHeartLose = !isCorrect && hearts > 0;

    setSelected(art);

    if (isHeartMoment) sounds.heartGain.play();
    else if (isHeartLose) sounds.heartLose.play();
    else sounds[isCorrect ? "correct" : "wrong"].play();

    setTimeout(() => {
      if (!isCorrect) {
        if (hearts > 0) {
          setHearts(h => h - 1);
          triggerHeartNotification("lose");
          setTimeout(() => {
            const nextIdx = idx + 1;
            if (nextIdx >= queue.length) {
              sounds.levelComplete.play();
              confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } });
              saveHS(difficulty, queue.length);
              setHighScores(hs => ({ ...hs, [difficulty]: queue.length }));
              setFinalStreak(queue.length);
              setIsLevelComplete(true);
              setGameOver(true);
              return;
            }
            setIdx(nextIdx);
            setSelected(null);
          }, 500);
          return;
        }

        const newStreak = streak;
        const prev = getHS(difficulty);
        const isNew = newStreak > prev;
        if (isNew) {
          confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } });
          sounds.highscore.play();
          saveHS(difficulty, newStreak);
          setHighScores(hs => ({ ...hs, [difficulty]: newStreak }));
        }
        setFinalStreak(newStreak);
        setIsNewHigh(isNew);
        setGameOver(true);

      } else {
        const newStreak = streak + 1;
        setStreak(newStreak);
        if (newStreak % 10 === 0) {
          setHearts(h => Math.min(h + 1, 3));
          triggerHeartNotification("gain");
        }

        const nextIdx = idx + 1;
        if (nextIdx >= queue.length) {
          sounds.levelComplete.play();
          confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } });
          saveHS(difficulty, newStreak);
          setHighScores(hs => ({ ...hs, [difficulty]: newStreak }));
          setFinalStreak(newStreak);
          setIsLevelComplete(true);
          setGameOver(true);
          return;
        }

        setTimeout(() => {
          setIdx(nextIdx);
          setSelected(null);
        }, 600);
      }
    }, 100);
  };

        const shareScore = () => {
          const text = `🔥 I scored ${finalStreak} in Article Fever!\nCan you beat me?`;
          const url = `https://t.me/ArticleFever_bot`;

          const tg = window.Telegram?.WebApp;

          if (tg?.openTelegramLink) {
            tg.openTelegramLink(
              `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
            );
          } else {
            navigator.clipboard.writeText(`${text}\n${url}`);
            alert("Score copied to clipboard!");
          }
        };

  const current = queue[idx];

  const btnStyle = (art) => {
    if (!selected) return { bg: "#D0D0D0", color: "#111", border: "2px solid transparent" };
    const isCorrect = art === queue[idx].article;
    const isChosen = art === selected;
    if (isCorrect) return { bg: GREEN, color: "#fff", border: `2px solid ${GREEN}` };
    if (isChosen && !isCorrect) return { bg: RED, color: "#fff", border: `2px solid ${RED}` };
    return { bg: "#D0D0D0", color: "#999", border: "2px solid transparent" };
  };

  const modalEmoji = isLevelComplete ? "🎊" : isNewHigh ? "🏆" : finalStreak >= 10 ? "🎉" : "😅";
  const modalTitle = isLevelComplete ? "Level Complete!" : isNewHigh ? "New High Score!" : "Streak Broken!";

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", background: "#ffffff", color: "#111", padding: 16, colorScheme: "light" }}>

      {/* ── MENU ── */}
      {screen === "menu" && (
        <div style={{ textAlign: "center", maxWidth: 420, width: "100%", background: "#F5F5F5", borderRadius: 28, padding: "48px 28px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
          <img src="/favicon.svg" style={{ width: 64, height: 64, marginBottom: 24 }} />
          <h1 style={{ fontSize: 36, fontWeight: 800, color: "#323232", letterSpacing: "-1px", margin: "0 0 28px" }}>Article Fever</h1>
          {userName && (<p style={{ color: "#777", marginTop: -20, marginBottom: 24 }}>Ready, {userName}?</p>)}
          <p style={{ color: "#666", marginBottom: 42, lineHeight: 1.4, fontSize: 15 }}>
            Build your streak.<br />Earn a hearts every 10 correct answers.<br />Master German articles.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {["beginner", "intermediate", "advanced"].map(d => (
              <motion.button key={d}
                onClick={() => setTimeout(() => startGame(d), 120)}
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02, background: "#838383", color: "#fff" }}
                style={{ padding: "18px 24px", borderRadius: 16, border: "none", background: "#D0D0D0", color: "#111", fontSize: 16, cursor: "pointer", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.15s" }}>
                <span>{DIFFICULTY_LABELS[d]}</span>
                <span style={{ fontSize: 13 }}>🏆 {highScores[d]}</span>
              </motion.button>
            ))}
          </div>
          <p style={{ marginTop: 48, fontSize: 11, color: "#999", letterSpacing: 0.5 }}>v1.1</p>
        </div>
      )}

      {/* ── GAME ── */}
      {screen === "game" && current && (
        <div style={{ width: "100%", maxWidth: 480 }}>
          
          {/* Top bar */}
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto",
            display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 8px", zIndex: 10 }}>
            <button onClick={() => setShowQuitPopup(true)}
            style={{ border: "none", background: "transparent", fontSize: 32, color: "#777", cursor: "pointer", lineHeight: 1}}>
            x
            </button>
            <span style={{ fontSize: 14, color: "#777" }}>
            {DIFFICULTY_LABELS[difficulty]} • Best: {highScores[difficulty]}
            </span>
          </div>
          {/* Hearts & streak */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {[1, 2, 3].map(n => (
                <img key={n} src="/images/heart.png" style={{ width: 32, height: 32, opacity: n <= hearts ? 1 : 0.25 }} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <img src="/images/streak.png" style={{ width: 32, height: 32 }} />
              <span style={{ fontSize: 28, fontWeight: 700, color: "#f5a623" }}>{streak}</span>
            </div>
          </div>

          {/* Heart notification overlay */}
          <AnimatePresence>
            {heartNotification && (
              <motion.div
                key={heartNotification + Date.now()}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 0.85, scale: 1 }}
                exit={{ opacity: 0, scale: 1.2 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: heartNotification === "gain" ? "rgba(19,171,94,0.15)" : "rgba(255,0,0,0.1)", borderRadius: 24, padding: "16px 28px" }}>
                  <img src="/images/heart.png" style={{ width: 64, height: 64 }} />
                  <span style={{ fontSize: 42, fontWeight: 800, color: heartNotification === "gain" ? GREEN : RED }}>
                    {heartNotification === "gain" ? "+1" : "-1"}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Word card & buttons */}
          <AnimatePresence mode="wait">
            <motion.div key={idx}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}>
              <div style={{ background: "#D0D0D0", borderRadius: 16, padding: "40px 24px", textAlign: "center", marginBottom: 28 }}>
                <p style={{ margin: "0 0 4px", fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>What is the article for...</p>
                <h2 style={{ margin: 0, fontSize: 40, fontWeight: 700, color: "#323232" }}>{current.word}</h2>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "#555" }}>({current.meaning})</p>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 64 }}>
                {ARTICLES.map(art => {
                  const { bg, color, border } = btnStyle(art);
                  return (
                    <motion.button whileTap={{ scale: 0.95 }} key={art} onClick={() => handleAnswer(art)}
                      style={{ flex: 1, padding: "18px 0", borderRadius: 12, border, background: bg, color: "#323232", fontSize: 22, fontWeight: 700, cursor: selected ? "default" : "pointer", transition: "background 0.15s, color 0.15s, transform 0.1s" }}>
                      {art}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Quit confirmation popup */}
          {showQuitPopup && (
            <div
            onClick={() => setShowQuitPopup(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
              <motion.div
                onClick={e => e.stopPropagation()}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ background: "#fff", borderRadius: 20, padding: "36px 28px", maxWidth: 320, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🤔</div>
                <h2 style={{ margin: "0 0 12px", fontSize: 24, color: "#323232" }}>Quit game?</h2>
                <p style={{ color: "#777", fontSize: 14, marginBottom: 28 }}>Your current streak will be lost.</p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setShowQuitPopup(false)}
                    style={{ flex: 1, padding: "13px 0", borderRadius: 10, border: "none", background: "#D0D0D0", color: "#111", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                    Keep Playing
                  </button>
                  <button onClick={() => setScreen("menu")}
                    style={{ flex: 1, padding: "13px 0", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                    Quit
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Game over modal */}
          {gameOver && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                style={{ background: "#fff", borderRadius: 20, padding: "48px 36px", maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
                <div style={{ fontSize: 52, marginBottom: 16 }}>{modalEmoji}</div>
                <h2 style={{ margin: "0 0 24px", fontSize: 24, color: "#323232" }}>{modalTitle}</h2>
                <p style={{ color: "#777", margin: "0 0 16px", fontSize: 14 }}>{DIFFICULTY_LABELS[difficulty]}</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 }}>
                  <img src="/images/streak.png" style={{ width: 64, height: 64 }} />
                  <div style={{ fontSize: 52, fontWeight: 700, color: "#f5a623" }}>{finalStreak}</div>
                </div>
                <p style={{ color: "#999", fontSize: 13, marginBottom: 16 }}>
                  {isLevelComplete
                    ? `All ${queue.length} words completed!`
                    : isNewHigh
                    ? `Previous best: ${getHS(difficulty) === finalStreak ? 0 : getHS(difficulty)}`
                    : `Best: ${highScores[difficulty]}`}
                </p>
                {!isLevelComplete && (
                  <p style={{ fontSize: 14, color: RED, marginBottom: 28 }}>
                    ✗ {selected} {current.word} → <b style={{ color: "#111" }}>{current.article} {current.word}</b>
                  </p>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => startGame(difficulty)}
                    style={{ flex: 1, padding: "13px 0", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                    Play Again
                  </button>
                  <button
                  onClick={shareScore}
                  style={{flex: 1, padding: "13px 0", borderRadius: 10, border: "none", background: "#f5a623", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer"}}>
                  Share
                  </button>
                  <button onClick={() => setScreen("menu")}
                    style={{ flex: 1, padding: "13px 0", borderRadius: 10, border: "none", background: "#D0D0D0", color: "#111", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                    Home
                  </button>
                </div>
              </motion.div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}