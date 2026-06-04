import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import NOUNS from "./data/nouns.json";
import confetti from "canvas-confetti";
import { Howl } from "howler";

const ARTICLES = ["der", "die", "das"];
const DIFFICULTY_LABELS = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const GREEN = "#2E8B57";
const RED = "#D94A4A";

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
  const [heartStreak, setHeartStreak] = useState(0);
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
    setHeartStreak(0);
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
    const isHeartMoment = isCorrect && (heartStreak + 1) % 10 === 0 && hearts < 3;
    const isHeartLose = !isCorrect && hearts > 0;

    setSelected(art);

    if (isHeartMoment) sounds.heartGain.play();
    else if (isHeartLose) sounds.heartLose.play();
    else sounds[isCorrect ? "correct" : "wrong"].play();

    setTimeout(() => {
      if (!isCorrect) {
        if (hearts > 0) {
          setHearts(h => h - 1);
          setHeartStreak(0);
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
        const newHeartStreak = heartStreak + 1;
        setHeartStreak(newHeartStreak);
        if (newHeartStreak % 10 === 0 && hearts < 3) {
          setHearts(h => h + 1);
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
          const text = `🔥 I scored ${finalStreak} on ${DIFFICULTY_LABELS[difficulty]} in Article Fever!\nCan you beat me?`;
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
  if (!selected) {
    return {
      bg: "#FFFFFF",
      color: "#2D2D2D",
      border: "2px solid #D8D1C7"
    };
  }

  const isCorrect = art === queue[idx].article;
  const isChosen = art === selected;

  if (isCorrect) {
    return {
      bg: "#2E8B57",
      color: "#FFFFFF",
      border: "2px solid #2E8B57"
    };
  }

  if (isChosen && !isCorrect) {
    return {
      bg: "#D94A4A",
      color: "#FFFFFF",
      border: "2px solid #D94A4A"
    };
  }

  return {
    bg: "#FFFFFF",
    color: "#767676",
    border: "2px solid #D8D1C7"
  };
};

  const modalEmoji = isLevelComplete ? "🎊" : isNewHigh ? "🏆" : finalStreak >= 10 ? "🎉" : "😅";
  const modalTitle = isLevelComplete ? "Level Complete!" : isNewHigh ? "New High Score!" : "Streak Broken!";

  return (
    <div style={{ width: "100%", height: "100vh", paddingTop: 152, paddingBottom: 114, paddingLeft: 8, paddingRight: 8, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>

  {/* ── MENU ── */}
  {screen === "menu" && (
    <div style={{ textAlign: "center", maxWidth: 420, width: "100%", padding: "48px 28px" }}>
      <img src="/favicon.svg" style={{ width: 72, height: 72, marginBottom: 20 }} />

      <h1 style={{ fontSize: 36, fontWeight: 800, color: "#2D2D2D", letterSpacing: "-1px", margin: "0 0 16px" }}>
        Article Fever
      </h1>

      <p style={{ color: "#767676", marginBottom: 42, lineHeight: 1.5, fontSize: 15 }}>
        Build your streak.<br />
        10 correct in a row = +1 heart.<br />
        Master German articles.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {["beginner", "intermediate", "advanced"].map(d => (
          <motion.button
            key={d}
            onClick={() => setTimeout(() => startGame(d), 120)}
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.02, background: "#FDEFD8" }}
            style={{
              padding: "18px 24px",
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
              transition: "all 0.15s"
            }}
          >
            <span>{DIFFICULTY_LABELS[d]}</span>
            <span style={{ fontSize: 13, color: "#767676" }}>
              🏆 {highScores[d]}
            </span>
          </motion.button>
        ))}
      </div>

      <p style={{ marginTop: 48, fontSize: 11, color: "#767676", opacity: 0.7, letterSpacing: 0.5 }}>
        v1.2
      </p>
    </div>
  )}

            {/* ── GAME ── */}
            {screen === "game" && current && (
            <div
              style={{
                width: "100%",
                maxWidth: 480,
                height: "100vh",
                padding: 16,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                justifyContent: "center",
                paddingTop: 60,
              }}
            >
                
              {/* Top bar */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          background: "#FFFAF4",
          zIndex: 10,
          padding: "16px 16px 12px"
        }}
      >

        {/* Row 1: Back button and level/best */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12
          }}
        >
          <button
            onClick={() => setShowQuitPopup(true)}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 32,
              color: "#767676",
              cursor: "pointer",
              lineHeight: 1,
              padding: 12,
              paddingLeft: 0
            }}
          >
            ×
          </button>

          <span
            style={{
              fontSize: 14,
              color: "#767676",
              fontWeight: 600
            }}
          >
            {DIFFICULTY_LABELS[difficulty]} • Best: {highScores[difficulty]}
          </span>
        </div>

        {/* Row 2: Hearts and streak */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {[1, 2, 3].map(n => (
              <img
                key={n}
                src="/images/heart.png"
                style={{
                  width: 32,
                  height: 32,
                  opacity: n <= hearts ? 1 : 0.25
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <img
              src="/images/streak.png"
              style={{ width: 32, height: 32 }}
            />
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#F5A623"
              }}
            >
              {streak}
            </span>
          </div>
        </div>

        {/* Row 3: Progress bar */}
        <div
          style={{
            width: "100%",
            height: 6,
            background: "#E6E1DA",
            borderRadius: 999,
            transition: "opacity 0.5s ease"
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${hearts === 3 ? 100 : (heartStreak % 10) * 10}%`,
              background: "#2E8B57",
              borderRadius: 999,
              transition: "width 0.3s ease"
            }}
          />
        </div>

      </div>

          {/* Heart notification overlay */}
          <AnimatePresence>
          {heartNotification && (
            <div style={{ position: "fixed", top: 152, left: 0, right: 0, bottom: 192, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
              <motion.div
                key={heartNotification}
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{ display: "flex", alignItems: "center", gap: 10, background: heartNotification === "gain" ? "rgba(19,171,94,0.15)" : "rgba(217, 74, 74, 0.1)", borderRadius: 24, padding: "16px 28px" }}>
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
  
              <p style={{ margin: 0, fontSize: 11, color: "#ADADAD", textTransform: "uppercase", letterSpacing: 1.5 }}>
                What is the article for...
              </p>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: current.word.length > 15 ? 30 : current.word.length > 10 ? 32 : current.word.length > 8 ? 36 : 44, fontWeight: 800, color: "#2D2D2D", wordBreak: "break-word", lineHeight: 1.1 }}>
                  {current.word}
                </h2>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#ADADAD" }}>
                  ({current.meaning})
                </p>
              </div>
              <div />
            </div>
            </motion.div>
          </AnimatePresence>

          {/* Buttons — fixed, outside animation */}
          <div style={{ position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 448, display: "flex", gap: 8 }}>
            {ARTICLES.map(art => {
              const { bg, color, border } = btnStyle(art);
              return (
                <motion.button whileTap={{ scale: 0.95 }} key={art} onClick={() => handleAnswer(art)}
                  style={{ flex: 1, padding: "16px 0", borderRadius: 48, border, background: bg, color, fontSize: 22, fontWeight: 700, cursor: selected ? "default" : "pointer", transition: "background 0.15s, color 0.15s, transform 0.1s" }}>
                  {art}
                </motion.button>
              );
            })}
          </div>

          {/* Quit confirmation popup */}
          {showQuitPopup && (
            <div
              onClick={() => setShowQuitPopup(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
            >
              <motion.div
                onClick={e => e.stopPropagation()}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ background: "#FFFFFF", borderRadius: 24, padding: "36px 28px", maxWidth: 320, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.12)" }}
              >
                <div style={{ fontSize: 48, marginBottom: 16 }}>🤔</div>

                <h2 style={{ margin: "0 0 12px", fontSize: 24, color: "#2D2D2D" }}>
                  Quit game?
                </h2>

                <p style={{ color: "#767676", fontSize: 14, marginBottom: 28 }}>
                  Your current streak will be lost.
                </p>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowQuitPopup(false)}
                    style={{ flex: 1, padding: "13px 0", borderRadius: 24, border: "2px solid #D8D1C7", background: "#FFFFFF", color: "#2D2D2D", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                  >
                    Keep Playing
                  </button>

                  <button
                    onClick={() => setScreen("menu")}
                    style={{ flex: 1, padding: "13px 0", borderRadius: 24, border: "2px solid #D94A4A", background: "#D94A4A", color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                  >
                    Quit
                  </button>
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
                style={{ background: "#FFFFFF", borderRadius: 24, padding: "48px 36px", maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.12)" }}
              >
                {isNewHigh && (
                  <div style={{ color: "#F5A623", fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
                    🏆 NEW HIGH SCORE!
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                  <img src="/images/streak.png" style={{ width: 56, height: 56 }} />
                  <div style={{ fontSize: 64, fontWeight: 800, color: "#F5A623", lineHeight: 1 }}>
                    {finalStreak}
                  </div>
                </div>

                <h2 style={{ margin: "0 0 8px", fontSize: 24, color: "#2D2D2D" }}>
                  {modalTitle}
                </h2>

                <p style={{ color: "#767676", fontSize: 13, marginBottom: 16 }}>
                  {DIFFICULTY_LABELS[difficulty]} • { }
                  {isLevelComplete
                    ? `All ${queue.length} words completed!`
                    : isNewHigh
                    ? `Previous best: ${getHS(difficulty) === finalStreak ? 0 : getHS(difficulty)}`
                    : `Best: ${highScores[difficulty]}`}
                </p>

                {!isLevelComplete && (
                  <div style={{ background: "#FFF4E8", borderRadius: 24, padding: "14px 16px", marginBottom: 24 }}>
                    <p style={{ fontSize: 12, color: "#767676", marginBottom: 8 }}>
                      Last mistake
                    </p>

                    <div style={{ fontSize: 15, color: "#D94A4A", marginBottom: 4 }}>
                      ✗ {selected} {current.word}
                    </div>

                    <div style={{ fontSize: 15, color: "#2E8B57", fontWeight: 700 }}>
                      ✓ {current.article} {current.word}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button
                    onClick={() => startGame(difficulty)}
                    style={{ padding: "14px 0", borderRadius: 48, border: "2px solid #2E8B57", background: "#2E8B57", color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                  >
                    Play Again
                  </button>

                  <button
                    onClick={shareScore}
                    style={{ padding: "14px 0", borderRadius: 48, border: "2px solid #F5A623", background: "#F5A623", color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                  >
                    Share Score
                  </button>

                  <button
                    onClick={() => setScreen("menu")}
                    style={{ padding: "14px 0", borderRadius: 48, border: "2px solid #D8D1C7", background: "#FFFFFF", color: "#2D2D2D", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                  >
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