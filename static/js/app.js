// === State ===
let currentEra = null;
let currentCurriculum = null;
let currentTopicIndex = null;
let currentLesson = null;
let currentQuiz = null;
let currentQuestionIndex = 0;
let quizScore = 0;
let answered = false;
let navigationStack = [];

// === Progress (localStorage) ===
function loadProgress() {
    const saved = localStorage.getItem("history_training_progress");
    if (saved) return JSON.parse(saved);
    return {
        streak: 0,
        lastActiveDate: null,
        eras: {}
    };
}

function saveProgress(progress) {
    localStorage.setItem("history_training_progress", JSON.stringify(progress));
}

function getEraProgress(era) {
    const progress = loadProgress();
    if (!progress.eras[era]) {
        progress.eras[era] = { completedTopics: [], quizScores: {} };
    }
    return progress.eras[era];
}

function markTopicComplete(era, topicId, score) {
    const progress = loadProgress();
    if (!progress.eras[era]) {
        progress.eras[era] = { completedTopics: [], quizScores: {} };
    }
    if (!progress.eras[era].completedTopics.includes(topicId)) {
        progress.eras[era].completedTopics.push(topicId);
    }
    progress.eras[era].quizScores[topicId] = score;
    updateStreak(progress);
    saveProgress(progress);
}

function updateStreak(progress) {
    const today = new Date().toISOString().split("T")[0];
    const lastActive = progress.lastActiveDate;

    if (lastActive === today) return;

    if (lastActive) {
        const last = new Date(lastActive);
        const now = new Date(today);
        const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            progress.streak += 1;
        } else if (diffDays > 1) {
            progress.streak = 1;
        }
    } else {
        progress.streak = 1;
    }
    progress.lastActiveDate = today;
}

// === Navigation ===
function showView(viewId) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(viewId).classList.add("active");

    const backBtn = document.getElementById("btn-back");
    backBtn.style.display = viewId === "view-home" ? "none" : "";
}

function goBack() {
    if (navigationStack.length > 0) {
        const prev = navigationStack.pop();
        showView(prev);
        updateHeader(prev);
    } else {
        goHome();
    }
}

function goHome() {
    navigationStack = [];
    showView("view-home");
    updateHeader("view-home");
    updateHomeStats();
}

function updateHeader(viewId) {
    const title = document.getElementById("header-title");
    switch (viewId) {
        case "view-home": title.textContent = "History Training"; break;
        case "view-curriculum": title.textContent = currentEra || "Curriculum"; break;
        case "view-lesson": title.textContent = "Lesson"; break;
        case "view-quiz": title.textContent = "Quiz"; break;
        case "view-results": title.textContent = "Results"; break;
    }
}

// === Loading ===
function showLoading(text) {
    document.getElementById("loading-text").textContent = text || "Generating content...";
    document.getElementById("loading").style.display = "flex";
}

function hideLoading() {
    document.getElementById("loading").style.display = "none";
}

// === Toast ===
function showToast(message) {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// === Home ===
function updateHomeStats() {
    const progress = loadProgress();

    document.getElementById("streak-count").textContent = progress.streak;
    document.getElementById("stat-streak").textContent = progress.streak;

    let totalCompleted = 0;
    let totalScore = 0;
    let scoreCount = 0;

    for (const era in progress.eras) {
        const ep = progress.eras[era];
        totalCompleted += ep.completedTopics.length;
        for (const tid in ep.quizScores) {
            totalScore += ep.quizScores[tid];
            scoreCount++;
        }
    }

    document.getElementById("stat-completed").textContent = totalCompleted;
    document.getElementById("stat-score").textContent =
        scoreCount > 0 ? Math.round((totalScore / (scoreCount * 5)) * 100) + "%" : "0%";

    // Update era progress bars
    const romeProgress = progress.eras["Ancient Rome"];
    if (romeProgress && currentCurriculum) {
        const pct = (romeProgress.completedTopics.length / currentCurriculum.topics.length) * 100;
        const bar = document.querySelector("#progress-ancient-rome .era-progress-bar");
        if (bar) bar.style.width = pct + "%";
    }

    // Update welcome message
    const subtitle = document.getElementById("welcome-subtitle");
    if (progress.streak > 0) {
        subtitle.textContent = `${progress.streak} day streak! Keep it going!`;
    }
}

function showComingSoon() {
    showToast("Coming soon! More eras will be added.");
}

// === Era Selection ===
async function selectEra(era) {
    currentEra = era;
    navigationStack.push("view-home");
    showLoading("Generating curriculum for " + era + "...");

    try {
        const resp = await fetch("/api/curriculum", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ era })
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Failed to load curriculum");
        }

        currentCurriculum = await resp.json();
        renderCurriculum();
        hideLoading();
        showView("view-curriculum");
        updateHeader("view-curriculum");
    } catch (err) {
        hideLoading();
        showToast("Error: " + err.message);
    }
}

function renderCurriculum() {
    document.getElementById("curriculum-title").textContent = currentCurriculum.era;
    document.getElementById("curriculum-desc").textContent = currentCurriculum.description;

    const eraProgress = getEraProgress(currentEra);
    const list = document.getElementById("topic-list");
    list.innerHTML = "";

    let firstIncomplete = -1;
    currentCurriculum.topics.forEach((topic, i) => {
        if (firstIncomplete === -1 && !eraProgress.completedTopics.includes(topic.id)) {
            firstIncomplete = i;
        }
    });

    currentCurriculum.topics.forEach((topic, i) => {
        const isCompleted = eraProgress.completedTopics.includes(topic.id);
        const isCurrent = i === firstIncomplete;
        const isLocked = i > firstIncomplete && firstIncomplete !== -1 && !isCompleted;

        const item = document.createElement("div");
        item.className = "topic-item" +
            (isCompleted ? " completed" : "") +
            (isCurrent ? " current" : "") +
            (isLocked ? " locked" : "");

        const score = eraProgress.quizScores[topic.id];

        item.innerHTML = `
            <div class="topic-number">${isCompleted ? "&#10003;" : topic.id}</div>
            <div class="topic-info">
                <div class="topic-title">${topic.title}</div>
                <div class="topic-subtitle">${topic.subtitle}</div>
                <div class="topic-year">${topic.year_range}</div>
            </div>
            <div class="topic-status">
                ${isCompleted ? '<span style="color:var(--success)">' + score + '/5</span>' :
                  isCurrent ? '&#8594;' :
                  isLocked ? '&#128274;' : ''}
            </div>
        `;

        if (!isLocked) {
            item.addEventListener("click", () => selectTopic(i));
        }

        list.appendChild(item);
    });
}

// === Lesson ===
async function selectTopic(index) {
    currentTopicIndex = index;
    const topic = currentCurriculum.topics[index];
    navigationStack.push("view-curriculum");
    showLoading("Generating lesson about " + topic.title + "...");

    try {
        const resp = await fetch("/api/lesson", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                era: currentEra,
                topic: topic.title,
                topic_id: topic.id
            })
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Failed to load lesson");
        }

        currentLesson = await resp.json();
        renderLesson();
        hideLoading();
        showView("view-lesson");
        updateHeader("view-lesson");
        window.scrollTo(0, 0);
    } catch (err) {
        hideLoading();
        showToast("Error: " + err.message);
    }
}

function renderLesson() {
    const container = document.getElementById("lesson-content");

    let html = `
        <h2>${currentLesson.title}</h2>
        <span class="lesson-era-tag">${currentLesson.era}</span>
    `;

    currentLesson.sections.forEach(section => {
        html += `
            <div class="lesson-section">
                <h3>${section.heading}</h3>
                <p>${section.content}</p>
            </div>
        `;
    });

    const dates = currentLesson.key_dates || currentLesson.key_takeaways || [];
    html += `
        <div class="key-takeaways">
            <h3>Key Dates to Remember</h3>
            <ul>
                ${Array.isArray(dates) && dates.length > 0 && typeof dates[0] === "object"
                    ? dates.map(d => `<li><strong>${d.date}</strong> — ${d.event}</li>`).join("")
                    : dates.map(t => `<li>${t}</li>`).join("")}
            </ul>
        </div>
    `;

    if (currentLesson.fun_fact) {
        html += `
            <div class="fun-fact">
                <strong>Fun Fact:</strong> ${currentLesson.fun_fact}
            </div>
        `;
    }

    container.innerHTML = html;
}

// === Quiz ===
async function startQuiz() {
    const topic = currentCurriculum.topics[currentTopicIndex];
    navigationStack.push("view-lesson");
    showLoading("Generating quiz questions...");

    try {
        const resp = await fetch("/api/quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                era: currentEra,
                topic: topic.title,
                topic_id: topic.id
            })
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Failed to load quiz");
        }

        currentQuiz = await resp.json();
        currentQuestionIndex = 0;
        quizScore = 0;
        hideLoading();
        showView("view-quiz");
        updateHeader("view-quiz");
        renderQuestion();
    } catch (err) {
        hideLoading();
        showToast("Error: " + err.message);
    }
}

function renderQuestion() {
    const q = currentQuiz.questions[currentQuestionIndex];

    document.getElementById("quiz-title").textContent = currentQuiz.topic;
    document.getElementById("quiz-question-num").textContent = currentQuestionIndex + 1;
    document.getElementById("quiz-total").textContent = currentQuiz.questions.length;
    document.getElementById("question-text").textContent = q.question;

    const container = document.getElementById("options-container");
    container.innerHTML = "";

    const letters = ["A", "B", "C", "D"];
    q.options.forEach((opt, i) => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.innerHTML = `
            <span class="option-letter">${letters[i]}</span>
            <span>${opt}</span>
        `;
        btn.addEventListener("click", () => selectAnswer(i));
        container.appendChild(btn);
    });

    document.getElementById("quiz-feedback").style.display = "none";
    answered = false;
}

function selectAnswer(index) {
    if (answered) return;
    answered = true;

    const q = currentQuiz.questions[currentQuestionIndex];
    const correct = q.correct;
    const isCorrect = index === correct;

    if (isCorrect) quizScore++;

    // Highlight options
    const options = document.querySelectorAll(".option-btn");
    options.forEach((btn, i) => {
        btn.classList.add("disabled");
        if (i === correct) btn.classList.add("correct");
        if (i === index && !isCorrect) btn.classList.add("wrong");
    });

    // Show feedback
    const feedback = document.getElementById("quiz-feedback");
    feedback.style.display = "block";
    feedback.className = "quiz-feedback " + (isCorrect ? "correct" : "wrong");

    document.getElementById("feedback-text").textContent =
        isCorrect ? "Correct!" : "Not quite!";
    document.getElementById("feedback-explanation").textContent = q.explanation;

    const nextBtn = document.getElementById("btn-next-question");
    if (currentQuestionIndex >= currentQuiz.questions.length - 1) {
        nextBtn.textContent = "See Results";
    } else {
        nextBtn.innerHTML = "Next Question &#8594;";
    }
}

function nextQuestion() {
    currentQuestionIndex++;
    if (currentQuestionIndex >= currentQuiz.questions.length) {
        showResults();
    } else {
        renderQuestion();
        window.scrollTo(0, 0);
    }
}

// === Results ===
function showResults() {
    const total = currentQuiz.questions.length;
    const topic = currentCurriculum.topics[currentTopicIndex];

    document.getElementById("results-score").textContent = quizScore;

    let message, detail;
    const pct = quizScore / total;
    if (pct === 1) {
        message = "Perfect Score!";
        detail = "You've mastered this topic!";
    } else if (pct >= 0.8) {
        message = "Great Job!";
        detail = "You really know your history!";
    } else if (pct >= 0.6) {
        message = "Good Effort!";
        detail = "You're getting there, keep learning!";
    } else {
        message = "Keep Studying!";
        detail = "Review the lesson and try again.";
    }

    document.getElementById("results-message").textContent = message;
    document.getElementById("results-detail").textContent = detail;

    // Mark complete if scored 3+
    if (quizScore >= 3) {
        markTopicComplete(currentEra, topic.id, quizScore);
    }

    navigationStack = ["view-home", "view-curriculum"];
    showView("view-results");
    updateHeader("view-results");
}

function retakeQuiz() {
    currentQuestionIndex = 0;
    quizScore = 0;
    showView("view-quiz");
    renderQuestion();
}

function goToCurriculum() {
    navigationStack = ["view-home"];
    renderCurriculum();
    showView("view-curriculum");
    updateHeader("view-curriculum");
}

// === Init ===
function init() {
    updateHomeStats();

    // Check and update streak on load
    const progress = loadProgress();
    const today = new Date().toISOString().split("T")[0];
    if (progress.lastActiveDate) {
        const last = new Date(progress.lastActiveDate);
        const now = new Date(today);
        const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
            progress.streak = 0;
            saveProgress(progress);
        }
    }
    updateHomeStats();
}

init();
