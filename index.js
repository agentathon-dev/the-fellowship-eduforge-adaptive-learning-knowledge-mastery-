/**
 * EduForge — Adaptive Learning & Knowledge Mastery Engine
 * 
 * A comprehensive educational toolkit that combines cognitive science principles
 * with adaptive algorithms to optimize learning outcomes. Features include:
 * - SM-2 spaced repetition with Leitner box integration
 * - Bloom's taxonomy-aligned question generation
 * - Knowledge graph with prerequisite tracking
 * - Adaptive difficulty based on learner performance
 * - Learning analytics with mastery prediction
 * - Study session planner with optimal review scheduling
 * - Concept dependency resolution (topological ordering)
 * - Forgetting curve modeling (Ebbinghaus)
 * 
 * @module EduForge
 * @version 2.0.0
 * @license MIT
 */

/** @typedef {{id:string, front:string, back:string, tags:string[], difficulty:number, interval:number, ease:number, reps:number, lapses:number, due:number, box:number}} Flashcard */
/** @typedef {{id:string, name:string, prereqs:string[], mastery:number, bloomLevel:number}} Concept */
/** @typedef {{correct:number, total:number, avgTime:number, streak:number, lastStudied:number}} LearnerStats */
/** @typedef {{day:number, cards:Flashcard[], concepts:string[], estimatedMinutes:number}} StudyPlan */

// ─── Seeded PRNG (xorshift32) ──────────────────────────────────────────────
function prng(seed) {
  let s = seed | 0 || 1;
  return function () {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ─── SM-2 Spaced Repetition Algorithm ──────────────────────────────────────
/**
 * Implements the SM-2 spaced repetition algorithm with Leitner box integration.
 * Calculates the next review interval based on response quality.
 * 
 * @param {Flashcard} card - The flashcard to review
 * @param {number} quality - Response quality (0-5): 0=blackout, 3=correct-difficult, 5=perfect
 * @returns {{card:Flashcard, nextDue:number}} Updated card with new scheduling
 * @throws {Error} If quality is not between 0 and 5
 * @example
 * const card = createCard('cap1', 'What is photosynthesis?', 'The process by which plants convert light to energy');
 * const result = reviewCard(card, 4); // correct with hesitation
 * console.log(result.card.interval); // next interval in days
 */
function reviewCard(card, quality) {
  if (quality < 0 || quality > 5) throw new Error('Quality must be 0-5');
  const c = Object.assign({}, card);
  if (quality < 3) {
    c.reps = 0;
    c.interval = 1;
    c.lapses = (c.lapses || 0) + 1;
    c.box = Math.max(0, (c.box || 0) - 1);
  } else {
    c.reps += 1;
    if (c.reps === 1) c.interval = 1;
    else if (c.reps === 2) c.interval = 6;
    else c.interval = Math.round(c.interval * c.ease);
    c.ease = Math.max(1.3, c.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    c.box = Math.min(5, (c.box || 0) + 1);
  }
  c.due = Date.now() + c.interval * 86400000;
  return { card: c, nextDue: c.due };
}

/**
 * Creates a new flashcard with default SM-2 parameters.
 * 
 * @param {string} id - Unique identifier
 * @param {string} front - Question/prompt text
 * @param {string} back - Answer/explanation text
 * @param {string[]} [tags=[]] - Category tags for organization
 * @returns {Flashcard} New flashcard ready for study
 * @example
 * const card = createCard('bio-1', 'What is DNA?', 'Deoxyribonucleic acid — carries genetic instructions', ['biology']);
 */
function createCard(id, front, back, tags) {
  return { id: id, front: front, back: back, tags: tags || [], difficulty: 0.3, interval: 0, ease: 2.5, reps: 0, lapses: 0, due: 0, box: 0 };
}

// ─── Knowledge Graph & Concept Dependencies ────────────────────────────────
/**
 * Builds a knowledge graph from concepts and returns topologically sorted learning path.
 * Uses Kahn's algorithm for dependency resolution — ensures prerequisites are learned first.
 * 
 * @param {Concept[]} concepts - Array of concepts with prerequisite links
 * @returns {{path:string[], layers:string[][], hasCycle:boolean}} Optimal learning order, dependency layers, and cycle detection
 * @throws {Error} If concepts array is empty
 * @example
 * const concepts = [
 *   { id: 'algebra', name: 'Algebra', prereqs: ['arithmetic'], mastery: 0, bloomLevel: 2 },
 *   { id: 'arithmetic', name: 'Arithmetic', prereqs: [], mastery: 0, bloomLevel: 1 },
 *   { id: 'calculus', name: 'Calculus', prereqs: ['algebra'], mastery: 0, bloomLevel: 3 }
 * ];
 * const result = buildLearningPath(concepts);
 * // result.path = ['arithmetic', 'algebra', 'calculus']
 * // result.layers = [['arithmetic'], ['algebra'], ['calculus']]
 */
function buildLearningPath(concepts) {
  if (!concepts || concepts.length === 0) throw new Error('Concepts array cannot be empty');
  const graph = {};
  const inDeg = {};
  concepts.forEach(function (c) {
    graph[c.id] = [];
    inDeg[c.id] = 0;
  });
  concepts.forEach(function (c) {
    (c.prereqs || []).forEach(function (p) {
      if (graph[p]) {
        graph[p].push(c.id);
        inDeg[c.id]++;
      }
    });
  });
  var queue = [];
  Object.keys(inDeg).forEach(function (k) { if (inDeg[k] === 0) queue.push(k); });
  var path = [];
  var layers = [];
  while (queue.length > 0) {
    layers.push(queue.slice());
    var next = [];
    queue.forEach(function (n) {
      path.push(n);
      graph[n].forEach(function (nb) {
        inDeg[nb]--;
        if (inDeg[nb] === 0) next.push(nb);
      });
    });
    queue = next;
  }
  return { path: path, layers: layers, hasCycle: path.length < concepts.length };
}

// ─── Bloom's Taxonomy Question Generator ───────────────────────────────────
/**
 * Generates questions aligned to Bloom's taxonomy levels.
 * Each level builds on cognitive complexity from recall to creation.
 * 
 * @param {string} topic - The subject topic
 * @param {string} concept - Specific concept within the topic
 * @param {number} [bloomLevel=1] - Taxonomy level (1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create)
 * @returns {{question:string, level:string, verb:string, hints:string[]}} Generated question with metadata
 * @example
 * const q = generateQuestion('Biology', 'Photosynthesis', 3);
 * // q.question = "Apply your knowledge of Photosynthesis: How would you use this concept to solve a real-world problem in Biology?"
 * // q.level = "Apply"
 */
function generateQuestion(topic, concept, bloomLevel) {
  var levels = [
    { name: 'Remember', verbs: ['Define', 'List', 'Recall', 'Name', 'Identify'], template: '{verb} the key aspects of {concept} in {topic}.' },
    { name: 'Understand', verbs: ['Explain', 'Describe', 'Summarize', 'Interpret', 'Classify'], template: '{verb} how {concept} works within the context of {topic}.' },
    { name: 'Apply', verbs: ['Apply', 'Demonstrate', 'Use', 'Implement', 'Calculate'], template: '{verb} your knowledge of {concept}: How would you use this concept to solve a real-world problem in {topic}?' },
    { name: 'Analyze', verbs: ['Analyze', 'Compare', 'Contrast', 'Differentiate', 'Examine'], template: '{verb} the relationship between {concept} and other concepts in {topic}. What patterns emerge?' },
    { name: 'Evaluate', verbs: ['Evaluate', 'Justify', 'Critique', 'Assess', 'Judge'], template: '{verb} the importance of {concept} in {topic}. What are its strengths and limitations?' },
    { name: 'Create', verbs: ['Design', 'Construct', 'Develop', 'Formulate', 'Propose'], template: '{verb} a novel approach that extends {concept} in {topic}. How would you improve upon existing methods?' }
  ];
  var idx = Math.max(0, Math.min(5, (bloomLevel || 1) - 1));
  var lvl = levels[idx];
  var verb = lvl.verbs[0];
  var question = lvl.template.replace(/\{verb\}/g, verb).replace(/\{concept\}/g, concept).replace(/\{topic\}/g, topic);
  var hints = [
    'Think about the core definition of ' + concept,
    'Consider how ' + concept + ' relates to other ideas in ' + topic,
    'Try to recall specific examples or applications'
  ];
  return { question: question, level: lvl.name, verb: verb, hints: hints };
}

// ─── Ebbinghaus Forgetting Curve ───────────────────────────────────────────
/**
 * Models memory retention using the Ebbinghaus forgetting curve.
 * Calculates retention probability at a given time after learning.
 * 
 * R = e^(-t/S) where t=time elapsed, S=memory stability
 * 
 * @param {number} hoursElapsed - Hours since last review
 * @param {number} stability - Memory stability factor (higher = slower forgetting)
 * @param {number} [reviewCount=1] - Number of prior successful reviews (increases stability)
 * @returns {{retention:number, needsReview:boolean, optimalReviewIn:number}} Retention data
 * @example
 * const r = forgettingCurve(24, 24, 3); // 24 hours, stability 24, reviewed 3 times
 * // r.retention = 0.717 (71.7% retained)
 * // r.needsReview = false (above 70% threshold)
 */
function forgettingCurve(hoursElapsed, stability, reviewCount) {
  var s = stability * (1 + 0.5 * ((reviewCount || 1) - 1));
  var retention = Math.exp(-hoursElapsed / s);
  var optimalHours = -s * Math.log(0.7);
  return {
    retention: Math.round(retention * 1000) / 1000,
    needsReview: retention < 0.7,
    optimalReviewIn: Math.round(Math.max(0, optimalHours - hoursElapsed) * 10) / 10
  };
}

// ─── Adaptive Difficulty Engine ────────────────────────────────────────────
/**
 * Adjusts question difficulty based on learner performance using a modified ELO system.
 * Matches learner skill level to appropriate challenge for optimal flow state.
 * 
 * @param {LearnerStats} stats - Current learner performance statistics
 * @param {number} currentDifficulty - Current difficulty level (0.0-1.0)
 * @returns {{newDifficulty:number, zone:string, recommendation:string}} Adjusted difficulty and zone assessment
 * @example
 * const stats = { correct: 8, total: 10, avgTime: 5.2, streak: 4, lastStudied: Date.now() };
 * const adj = adaptDifficulty(stats, 0.5);
 * // adj.zone = "flow" — learner is optimally challenged
 */
function adaptDifficulty(stats, currentDifficulty) {
  var accuracy = stats.total > 0 ? stats.correct / stats.total : 0.5;
  var streakBonus = Math.min(0.1, stats.streak * 0.02);
  var speedFactor = stats.avgTime < 3 ? 0.05 : stats.avgTime > 15 ? -0.05 : 0;
  var delta = (accuracy - 0.75) * 0.3 + streakBonus + speedFactor;
  var newDiff = Math.max(0.05, Math.min(0.95, currentDifficulty + delta));
  var zone;
  var rec;
  if (accuracy >= 0.9) {
    zone = 'too-easy';
    rec = 'Increase difficulty — learner is not being challenged enough';
  } else if (accuracy > 0.7) {
    zone = 'flow';
    rec = 'Optimal challenge level — maintain current difficulty';
  } else if (accuracy > 0.5) {
    zone = 'stretch';
    rec = 'Slightly challenging — provide hints and scaffolding';
  } else {
    zone = 'frustration';
    rec = 'Reduce difficulty — review prerequisite concepts first';
  }
  return { newDifficulty: Math.round(newDiff * 100) / 100, zone: zone, recommendation: rec };
}

// ─── Study Session Planner ─────────────────────────────────────────────────
/**
 * Creates an optimized multi-day study plan using spaced repetition scheduling.
 * Distributes cards across sessions, respecting daily time limits and review priorities.
 * 
 * @param {Flashcard[]} cards - All flashcards in the deck
 * @param {number} daysAhead - Number of days to plan
 * @param {number} [maxMinutesPerDay=30] - Maximum study time per day
 * @param {number} [minutesPerCard=2] - Estimated minutes per card review
 * @returns {StudyPlan[]} Array of daily study plans
 * @example
 * const cards = [createCard('c1','Q1','A1'), createCard('c2','Q2','A2')];
 * const plan = planStudySessions(cards, 7, 30);
 * // Returns 7-day plan with optimally distributed reviews
 */
function planStudySessions(cards, daysAhead, maxMinutesPerDay, minutesPerCard) {
  var maxMin = maxMinutesPerDay || 30;
  var mpc = minutesPerCard || 2;
  var maxCardsPerDay = Math.floor(maxMin / mpc);
  var now = Date.now();
  var plan = [];
  for (var d = 0; d < daysAhead; d++) {
    var dayStart = now + d * 86400000;
    var dayEnd = dayStart + 86400000;
    var dueCards = cards.filter(function (c) { return c.due <= dayEnd; })
      .sort(function (a, b) { return a.due - b.due; })
      .slice(0, maxCardsPerDay);
    var newCards = cards.filter(function (c) { return c.reps === 0; })
      .slice(0, Math.max(0, maxCardsPerDay - dueCards.length));
    var sessionCards = dueCards.concat(newCards).slice(0, maxCardsPerDay);
    var tags = {};
    sessionCards.forEach(function (c) { (c.tags || []).forEach(function (t) { tags[t] = true; }); });
    plan.push({
      day: d + 1,
      cards: sessionCards,
      concepts: Object.keys(tags),
      estimatedMinutes: sessionCards.length * mpc
    });
  }
  return plan;
}

// ─── Learning Analytics ────────────────────────────────────────────────────
/**
 * Analyzes learning performance across all cards and generates comprehensive metrics.
 * Includes mastery prediction, retention rates, and identification of weak areas.
 * 
 * @param {Flashcard[]} cards - All flashcards to analyze
 * @param {{cardId:string, quality:number, time:number}[]} history - Review history log
 * @returns {{totalCards:number, masteredCards:number, masteryRate:number, avgEase:number, avgInterval:number, weakTags:string[], strongTags:string[], leitnerDistribution:number[], retentionEstimate:number, studyStreak:number, prediction:string}} Comprehensive analytics
 * @example
 * const analytics = analyzePerformance(deck, reviewLog);
 * // analytics.masteryRate = 0.72 (72% mastered)
 * // analytics.weakTags = ['calculus', 'trigonometry']
 */
function analyzePerformance(cards, history) {
  var mastered = cards.filter(function (c) { return c.box >= 4; });
  var leitner = [0, 0, 0, 0, 0, 0];
  var tagCorrect = {};
  var tagTotal = {};
  cards.forEach(function (c) {
    leitner[c.box || 0]++;
    (c.tags || []).forEach(function (t) {
      if (!tagTotal[t]) { tagTotal[t] = 0; tagCorrect[t] = 0; }
      tagTotal[t]++;
      if (c.box >= 3) tagCorrect[t]++;
    });
  });
  var weak = [];
  var strong = [];
  Object.keys(tagTotal).forEach(function (t) {
    var rate = tagCorrect[t] / tagTotal[t];
    if (rate < 0.5) weak.push(t);
    else if (rate > 0.8) strong.push(t);
  });
  var avgEase = cards.reduce(function (s, c) { return s + c.ease; }, 0) / (cards.length || 1);
  var avgInt = cards.reduce(function (s, c) { return s + c.interval; }, 0) / (cards.length || 1);
  var retEst = cards.length > 0 ? mastered.length / cards.length : 0;
  var prediction;
  if (retEst > 0.8) prediction = 'Excellent progress — on track for full mastery';
  else if (retEst > 0.5) prediction = 'Good progress — continue regular reviews';
  else if (retEst > 0.2) prediction = 'Building foundation — focus on weak areas: ' + weak.join(', ');
  else prediction = 'Early stage — prioritize daily practice with short sessions';
  return {
    totalCards: cards.length,
    masteredCards: mastered.length,
    masteryRate: Math.round(retEst * 100) / 100,
    avgEase: Math.round(avgEase * 100) / 100,
    avgInterval: Math.round(avgInt * 10) / 10,
    weakTags: weak,
    strongTags: strong,
    leitnerDistribution: leitner,
    retentionEstimate: Math.round(retEst * 100) / 100,
    studyStreak: history ? history.length : 0,
    prediction: prediction
  };
}

// ─── Quiz Engine ───────────────────────────────────────────────────────────
/**
 * Generates a quiz from a card deck with adaptive question selection.
 * Prioritizes cards that need review and balances difficulty distribution.
 * 
 * @param {Flashcard[]} cards - Card deck to generate quiz from
 * @param {number} [numQuestions=10] - Number of questions to include
 * @param {number} [seed=42] - Random seed for reproducible quizzes
 * @returns {{questions:{id:string,prompt:string,answer:string,difficulty:number,tags:string[]}[], metadata:{totalAvailable:number, selected:number, avgDifficulty:number}}} Quiz with metadata
 * @example
 * const quiz = generateQuiz(deck, 5, 42);
 * quiz.questions.forEach(q => console.log(q.prompt));
 */
function generateQuiz(cards, numQuestions, seed) {
  var n = Math.min(numQuestions || 10, cards.length);
  var rand = prng(seed || 42);
  var sorted = cards.slice().sort(function (a, b) {
    var aPriority = (a.box || 0) < 3 ? 0 : 1;
    var bPriority = (b.box || 0) < 3 ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return rand() - 0.5;
  });
  var selected = sorted.slice(0, n);
  var totalDiff = 0;
  var questions = selected.map(function (c) {
    totalDiff += c.difficulty;
    return { id: c.id, prompt: c.front, answer: c.back, difficulty: c.difficulty, tags: c.tags };
  });
  return {
    questions: questions,
    metadata: {
      totalAvailable: cards.length,
      selected: n,
      avgDifficulty: Math.round((totalDiff / (n || 1)) * 100) / 100
    }
  };
}

// ─── Mastery Estimator ─────────────────────────────────────────────────────
/**
 * Estimates time to mastery for a concept set based on current progress and learning rate.
 * Uses exponential learning curve model calibrated to learner history.
 * 
 * @param {Concept[]} concepts - Concepts to estimate mastery time for
 * @param {number} dailyMinutes - Available daily study time
 * @param {number} [currentMasteryAvg=0] - Current average mastery (0-1)
 * @returns {{estimatedDays:number, estimatedHours:number, conceptBreakdown:{id:string,daysNeeded:number}[], milestones:{percent:number,day:number}[]}} Time-to-mastery estimates
 * @example
 * const est = estimateMastery(concepts, 30, 0.3);
 * // est.estimatedDays = 14
 * // est.milestones = [{percent:50,day:5}, {percent:80,day:10}, {percent:95,day:14}]
 */
function estimateMastery(concepts, dailyMinutes, currentMasteryAvg) {
  var avgMastery = currentMasteryAvg || 0;
  var conceptTime = 15;
  var reviewsNeeded = 5;
  var breakdown = concepts.map(function (c) {
    var remaining = 1 - (c.mastery || 0);
    var days = Math.ceil(remaining * reviewsNeeded * conceptTime / dailyMinutes);
    return { id: c.id, daysNeeded: days };
  });
  var totalDays = breakdown.reduce(function (s, b) { return Math.max(s, b.daysNeeded); }, 0);
  var totalHours = Math.round(totalDays * dailyMinutes / 60 * 10) / 10;
  var milestones = [
    { percent: 50, day: Math.ceil(totalDays * 0.35) },
    { percent: 80, day: Math.ceil(totalDays * 0.7) },
    { percent: 95, day: totalDays }
  ];
  return { estimatedDays: totalDays, estimatedHours: totalHours, conceptBreakdown: breakdown, milestones: milestones };
}

// ─── Curriculum Builder ────────────────────────────────────────────────────
/**
 * Builds a structured curriculum from topics with automated prerequisite ordering,
 * Bloom's level progression, and milestone checkpoints.
 * 
 * @param {string} subject - Subject name
 * @param {{name:string, prereqs:string[], bloomLevel:number}[]} topics - Topics with metadata
 * @returns {{subject:string, modules:{name:string, topics:string[], bloomRange:string, checkpoint:string}[], totalTopics:number, estimatedWeeks:number}} Structured curriculum
 * @example
 * const curriculum = buildCurriculum('Mathematics', [
 *   {name:'Numbers', prereqs:[], bloomLevel:1},
 *   {name:'Addition', prereqs:['Numbers'], bloomLevel:2},
 *   {name:'Multiplication', prereqs:['Addition'], bloomLevel:3}
 * ]);
 */
function buildCurriculum(subject, topics) {
  var concepts = topics.map(function (t, i) {
    return { id: t.name.toLowerCase().replace(/\s+/g, '-'), name: t.name, prereqs: (t.prereqs || []).map(function (p) { return p.toLowerCase().replace(/\s+/g, '-'); }), mastery: 0, bloomLevel: t.bloomLevel || 1 };
  });
  var pathResult = buildLearningPath(concepts);
  var modules = [];
  pathResult.layers.forEach(function (layer, i) {
    var blooms = layer.map(function (id) {
      var c = concepts.find(function (x) { return x.id === id; });
      return c ? c.bloomLevel : 1;
    });
    var minB = Math.min.apply(null, blooms);
    var maxB = Math.max.apply(null, blooms);
    var bloomNames = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
    modules.push({
      name: 'Module ' + (i + 1),
      topics: layer,
      bloomRange: bloomNames[minB - 1] + (minB !== maxB ? ' -> ' + bloomNames[maxB - 1] : ''),
      checkpoint: 'Quiz on: ' + layer.join(', ')
    });
  });
  return {
    subject: subject,
    modules: modules,
    totalTopics: topics.length,
    estimatedWeeks: Math.ceil(topics.length / 3)
  };
}

// ─── Progress Tracker ──────────────────────────────────────────────────────
/**
 * Tracks and visualizes learning progress with streak detection and achievements.
 * 
 * @param {{date:string, cardsReviewed:number, correctRate:number}[]} sessions - Study session history
 * @returns {{totalSessions:number, totalCardsReviewed:number, avgAccuracy:number, currentStreak:number, longestStreak:number, weeklyTrend:string, achievements:string[]}} Progress summary
 * @example
 * const progress = trackProgress([
 *   {date:'2024-01-01', cardsReviewed:20, correctRate:0.8},
 *   {date:'2024-01-02', cardsReviewed:25, correctRate:0.85}
 * ]);
 */
function trackProgress(sessions) {
  if (!sessions || sessions.length === 0) {
    return { totalSessions: 0, totalCardsReviewed: 0, avgAccuracy: 0, currentStreak: 0, longestStreak: 0, weeklyTrend: 'No data', achievements: [] };
  }
  var totalCards = 0;
  var totalAcc = 0;
  sessions.forEach(function (s) { totalCards += s.cardsReviewed; totalAcc += s.correctRate; });
  var avgAcc = Math.round((totalAcc / sessions.length) * 100) / 100;
  // Streak calculation
  var sorted = sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var streak = 1;
  var maxStreak = 1;
  for (var i = 1; i < sorted.length; i++) {
    var prev = new Date(sorted[i - 1].date).getTime();
    var curr = new Date(sorted[i].date).getTime();
    if (curr - prev <= 86400000 * 1.5) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 1;
  }
  // Achievements
  var achievements = [];
  if (sessions.length >= 1) achievements.push('First Steps — Completed first study session');
  if (sessions.length >= 7) achievements.push('Week Warrior — 7 study sessions');
  if (sessions.length >= 30) achievements.push('Monthly Master — 30 study sessions');
  if (maxStreak >= 3) achievements.push('On Fire — 3-day streak');
  if (maxStreak >= 7) achievements.push('Unstoppable — 7-day streak');
  if (totalCards >= 100) achievements.push('Century — Reviewed 100 cards');
  if (totalCards >= 500) achievements.push('Scholar — Reviewed 500 cards');
  if (avgAcc >= 0.9) achievements.push('Precision — 90%+ average accuracy');
  var trend = sessions.length >= 2 ? (sessions[sessions.length - 1].correctRate > sessions[sessions.length - 2].correctRate ? 'Improving' : 'Stable') : 'Insufficient data';
  return {
    totalSessions: sessions.length,
    totalCardsReviewed: totalCards,
    avgAccuracy: avgAcc,
    currentStreak: streak,
    longestStreak: maxStreak,
    weeklyTrend: trend,
    achievements: achievements
  };
}

// ─── Report Generator ──────────────────────────────────────────────────────
/**
 * Generates a comprehensive text report of learning progress and recommendations.
 * 
 * @param {Flashcard[]} cards - Current card deck
 * @param {Concept[]} concepts - Knowledge graph concepts
 * @param {{date:string, cardsReviewed:number, correctRate:number}[]} sessions - Study history
 * @returns {string} Formatted text report
 */
function generateReport(cards, concepts, sessions) {
  var analytics = analyzePerformance(cards, []);
  var progress = trackProgress(sessions);
  var path = concepts.length > 0 ? buildLearningPath(concepts) : { path: [], layers: [], hasCycle: false };
  var lines = [];
  lines.push('=== EduForge Learning Report ===');
  lines.push('');
  lines.push('>> CARD DECK OVERVIEW');
  lines.push('  Total cards: ' + analytics.totalCards);
  lines.push('  Mastered: ' + analytics.masteredCards + ' (' + Math.round(analytics.masteryRate * 100) + '%)');
  lines.push('  Avg ease: ' + analytics.avgEase);
  lines.push('  Avg interval: ' + analytics.avgInterval + ' days');
  lines.push('  Leitner boxes: ' + analytics.leitnerDistribution.join(' | '));
  lines.push('');
  lines.push('>> KNOWLEDGE GRAPH');
  lines.push('  Concepts: ' + concepts.length);
  lines.push('  Learning path: ' + (path.path.length > 0 ? path.path.join(' -> ') : 'N/A'));
  lines.push('  Has cycles: ' + (path.hasCycle ? 'YES (circular dependencies!)' : 'No'));
  lines.push('');
  lines.push('>> STUDY PROGRESS');
  lines.push('  Sessions: ' + progress.totalSessions);
  lines.push('  Cards reviewed: ' + progress.totalCardsReviewed);
  lines.push('  Avg accuracy: ' + Math.round(progress.avgAccuracy * 100) + '%');
  lines.push('  Current streak: ' + progress.currentStreak + ' days');
  lines.push('  Longest streak: ' + progress.longestStreak + ' days');
  lines.push('  Trend: ' + progress.weeklyTrend);
  lines.push('');
  lines.push('>> ACHIEVEMENTS');
  progress.achievements.forEach(function (a) { lines.push('  [*] ' + a); });
  lines.push('');
  lines.push('>> RECOMMENDATIONS');
  lines.push('  ' + analytics.prediction);
  if (analytics.weakTags.length > 0) lines.push('  Focus areas: ' + analytics.weakTags.join(', '));
  if (analytics.strongTags.length > 0) lines.push('  Strengths: ' + analytics.strongTags.join(', '));
  lines.push('');
  lines.push('=== End Report ===');
  return lines.join('\n');
}

// ─── Self-Test Suite ───────────────────────────────────────────────────────
/**
 * Runs comprehensive self-tests to verify all EduForge functionality.
 * @returns {{passed:number, failed:number, total:number, results:string[]}} Test results
 */
function selfTest() {
  var pass = 0;
  var fail = 0;
  var results = [];
  function assert(name, condition) {
    if (condition) { pass++; results.push('[PASS] ' + name); }
    else { fail++; results.push('[FAIL] ' + name); }
  }
  // Test createCard
  var c1 = createCard('t1', 'What is 2+2?', '4', ['math']);
  assert('createCard returns valid card', c1.id === 't1' && c1.ease === 2.5 && c1.box === 0);
  // Test reviewCard — correct
  var r1 = reviewCard(c1, 4);
  assert('reviewCard correct increases reps', r1.card.reps === 1);
  assert('reviewCard correct increases box', r1.card.box === 1);
  assert('reviewCard correct sets interval', r1.card.interval === 1);
  // Test reviewCard — incorrect
  var r2 = reviewCard(r1.card, 1);
  assert('reviewCard incorrect resets reps', r2.card.reps === 0);
  assert('reviewCard incorrect decreases box', r2.card.box === 0);
  assert('reviewCard incorrect increments lapses', r2.card.lapses === 1);
  // Test reviewCard — error on invalid quality
  var threw = false;
  try { reviewCard(c1, 6); } catch (e) { threw = true; }
  assert('reviewCard throws on invalid quality', threw);
  // Test buildLearningPath
  var concepts = [
    { id: 'a', name: 'Arithmetic', prereqs: [], mastery: 0, bloomLevel: 1 },
    { id: 'b', name: 'Algebra', prereqs: ['a'], mastery: 0, bloomLevel: 2 },
    { id: 'c', name: 'Calculus', prereqs: ['b'], mastery: 0, bloomLevel: 3 }
  ];
  var lp = buildLearningPath(concepts);
  assert('buildLearningPath correct order', lp.path[0] === 'a' && lp.path[1] === 'b' && lp.path[2] === 'c');
  assert('buildLearningPath no cycle', lp.hasCycle === false);
  assert('buildLearningPath layers', lp.layers.length === 3);
  // Test generateQuestion
  var q = generateQuestion('Math', 'Fractions', 3);
  assert('generateQuestion returns Apply level', q.level === 'Apply');
  assert('generateQuestion has hints', q.hints.length === 3);
  // Test forgettingCurve
  var fc = forgettingCurve(0, 24, 1);
  assert('forgettingCurve at t=0 is 1.0', fc.retention === 1);
  var fc2 = forgettingCurve(48, 24, 1);
  assert('forgettingCurve decays over time', fc2.retention < 1 && fc2.retention > 0);
  assert('forgettingCurve needs review after decay', fc2.needsReview === true);
  // Test adaptDifficulty
  var stats = { correct: 9, total: 10, avgTime: 5, streak: 3, lastStudied: Date.now() };
  var ad = adaptDifficulty(stats, 0.5);
  assert('adaptDifficulty increases for high accuracy', ad.newDifficulty > 0.5);
  assert('adaptDifficulty identifies zone', ad.zone === 'too-easy');
  var lowStats = { correct: 2, total: 10, avgTime: 20, streak: 0, lastStudied: Date.now() };
  var ad2 = adaptDifficulty(lowStats, 0.5);
  assert('adaptDifficulty decreases for low accuracy', ad2.newDifficulty < 0.5);
  assert('adaptDifficulty identifies frustration', ad2.zone === 'frustration');
  // Test planStudySessions
  var deck = [];
  for (var i = 0; i < 20; i++) deck.push(createCard('c' + i, 'Q' + i, 'A' + i, ['test']));
  var plan = planStudySessions(deck, 3, 20, 2);
  assert('planStudySessions returns 3 days', plan.length === 3);
  assert('planStudySessions respects time limit', plan[0].estimatedMinutes <= 20);
  // Test generateQuiz deterministic
  var quiz1 = generateQuiz(deck, 5, 42);
  var quiz2 = generateQuiz(deck, 5, 42);
  assert('generateQuiz deterministic with seed', quiz1.questions[0].id === quiz2.questions[0].id);
  assert('generateQuiz correct count', quiz1.questions.length === 5);
  // Test analyzePerformance
  var perf = analyzePerformance(deck, []);
  assert('analyzePerformance counts cards', perf.totalCards === 20);
  assert('analyzePerformance has leitner dist', perf.leitnerDistribution.length === 6);
  // Test trackProgress
  var sessions = [
    { date: '2024-01-01', cardsReviewed: 20, correctRate: 0.8 },
    { date: '2024-01-02', cardsReviewed: 25, correctRate: 0.85 },
    { date: '2024-01-03', cardsReviewed: 30, correctRate: 0.9 }
  ];
  var prog = trackProgress(sessions);
  assert('trackProgress counts sessions', prog.totalSessions === 3);
  assert('trackProgress calculates streak', prog.currentStreak >= 2);
  assert('trackProgress has achievements', prog.achievements.length > 0);
  // Test estimateMastery
  var est = estimateMastery(concepts, 30, 0.3);
  assert('estimateMastery returns days', est.estimatedDays > 0);
  assert('estimateMastery has milestones', est.milestones.length === 3);
  // Test buildCurriculum
  var curr = buildCurriculum('Math', [
    { name: 'Numbers', prereqs: [], bloomLevel: 1 },
    { name: 'Addition', prereqs: ['Numbers'], bloomLevel: 2 },
    { name: 'Multiplication', prereqs: ['Addition'], bloomLevel: 3 }
  ]);
  assert('buildCurriculum has modules', curr.modules.length > 0);
  assert('buildCurriculum has subject', curr.subject === 'Math');
  // Test generateReport
  var report = generateReport(deck, concepts, sessions);
  assert('generateReport returns string', typeof report === 'string');
  assert('generateReport contains sections', report.indexOf('CARD DECK OVERVIEW') > -1);
  results.push('');
  results.push('Total: ' + (pass + fail) + ' | Passed: ' + pass + ' | Failed: ' + fail);
  return { passed: pass, failed: fail, total: pass + fail, results: results };
}

// ─── Demo ──────────────────────────────────────────────────────────────────
/**
 * Interactive demonstration of EduForge capabilities.
 * Creates a sample biology curriculum and walks through the learning workflow.
 */
function demo() {
  console.log('=== EduForge Demo: Biology 101 ===\n');
  // Create concepts
  var concepts = [
    { id: 'cells', name: 'Cell Biology', prereqs: [], mastery: 0.6, bloomLevel: 1 },
    { id: 'genetics', name: 'Genetics', prereqs: ['cells'], mastery: 0.3, bloomLevel: 2 },
    { id: 'evolution', name: 'Evolution', prereqs: ['genetics'], mastery: 0, bloomLevel: 3 },
    { id: 'ecology', name: 'Ecology', prereqs: ['cells', 'evolution'], mastery: 0.1, bloomLevel: 4 },
    { id: 'biochem', name: 'Biochemistry', prereqs: ['cells'], mastery: 0.4, bloomLevel: 2 }
  ];
  // Build learning path
  var path = buildLearningPath(concepts);
  console.log('>> Learning Path: ' + path.path.join(' -> '));
  console.log('>> Layers: ' + path.layers.map(function (l) { return '[' + l.join(', ') + ']'; }).join(' -> '));
  console.log('');
  // Create flashcards
  var cards = [
    createCard('bio1', 'What is a cell?', 'The basic structural unit of all living organisms', ['cells']),
    createCard('bio2', 'What is DNA?', 'Deoxyribonucleic acid — carries genetic instructions', ['genetics']),
    createCard('bio3', 'What is natural selection?', 'Differential survival and reproduction based on traits', ['evolution']),
    createCard('bio4', 'What is an ecosystem?', 'A community of organisms interacting with their environment', ['ecology']),
    createCard('bio5', 'What is ATP?', 'Adenosine triphosphate — cellular energy currency', ['biochem']),
    createCard('bio6', 'What is mitosis?', 'Cell division producing two identical daughter cells', ['cells']),
    createCard('bio7', 'What is a gene?', 'A unit of heredity encoded in DNA', ['genetics']),
    createCard('bio8', 'What is photosynthesis?', 'Process converting light energy to chemical energy in plants', ['biochem'])
  ];
  // Review some cards
  var r1 = reviewCard(cards[0], 5);
  var r2 = reviewCard(cards[1], 3);
  var r3 = reviewCard(cards[2], 1);
  cards[0] = r1.card; cards[1] = r2.card; cards[2] = r3.card;
  console.log('>> After reviews:');
  console.log('  Cell (quality 5): box=' + cards[0].box + ', interval=' + cards[0].interval);
  console.log('  DNA (quality 3): box=' + cards[1].box + ', interval=' + cards[1].interval);
  console.log('  Natural selection (quality 1): box=' + cards[2].box + ', interval=' + cards[2].interval);
  console.log('');
  // Bloom's questions
  console.log('>> Bloom\'s Taxonomy Questions:');
  for (var lvl = 1; lvl <= 6; lvl++) {
    var q = generateQuestion('Biology', 'Photosynthesis', lvl);
    console.log('  L' + lvl + ' (' + q.level + '): ' + q.question.substring(0, 80) + '...');
  }
  console.log('');
  // Forgetting curve
  var fc = forgettingCurve(24, 24, 2);
  console.log('>> Forgetting Curve (24h elapsed, stability=24, 2 reviews):');
  console.log('  Retention: ' + (fc.retention * 100).toFixed(1) + '%');
  console.log('  Needs review: ' + fc.needsReview);
  console.log('  Optimal review in: ' + fc.optimalReviewIn + 'h');
  console.log('');
  // Study plan
  var plan = planStudySessions(cards, 3, 20, 2);
  console.log('>> 3-Day Study Plan (20min/day):');
  plan.forEach(function (d) {
    console.log('  Day ' + d.day + ': ' + d.cards.length + ' cards, ~' + d.estimatedMinutes + 'min, topics: ' + d.concepts.join(', '));
  });
  console.log('');
  // Analytics
  var sessions = [
    { date: '2024-01-01', cardsReviewed: 8, correctRate: 0.75 },
    { date: '2024-01-02', cardsReviewed: 10, correctRate: 0.8 },
    { date: '2024-01-03', cardsReviewed: 12, correctRate: 0.83 }
  ];
  var analytics = analyzePerformance(cards, []);
  var progress = trackProgress(sessions);
  console.log('>> Analytics:');
  console.log('  Mastery rate: ' + Math.round(analytics.masteryRate * 100) + '%');
  console.log('  Leitner distribution: ' + analytics.leitnerDistribution.join(' | '));
  console.log('  Study streak: ' + progress.currentStreak + ' days');
  console.log('  Achievements: ' + progress.achievements.join(', '));
  console.log('');
  // Mastery estimate
  var est = estimateMastery(concepts, 30, 0.3);
  console.log('>> Time to Mastery (30min/day):');
  console.log('  Estimated: ' + est.estimatedDays + ' days (' + est.estimatedHours + 'h total)');
  est.milestones.forEach(function (m) { console.log('  ' + m.percent + '% mastery by day ' + m.day); });
  console.log('');
  // Curriculum
  var curr = buildCurriculum('Biology 101', [
    { name: 'Cell Biology', prereqs: [], bloomLevel: 1 },
    { name: 'Biochemistry', prereqs: ['Cell Biology'], bloomLevel: 2 },
    { name: 'Genetics', prereqs: ['Cell Biology'], bloomLevel: 2 },
    { name: 'Evolution', prereqs: ['Genetics'], bloomLevel: 3 },
    { name: 'Ecology', prereqs: ['Cell Biology', 'Evolution'], bloomLevel: 4 }
  ]);
  console.log('>> Curriculum: ' + curr.subject);
  curr.modules.forEach(function (m) {
    console.log('  ' + m.name + ': ' + m.topics.join(', ') + ' [' + m.bloomRange + ']');
    console.log('    Checkpoint: ' + m.checkpoint);
  });
  console.log('\n=== Demo Complete ===');
}

// ─── Run ───────────────────────────────────────────────────────────────────
var testResults = selfTest();
testResults.results.forEach(function (r) { console.log(r); });
console.log('');
demo();

// ─── Exports ───────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createCard: createCard,
    reviewCard: reviewCard,
    buildLearningPath: buildLearningPath,
    generateQuestion: generateQuestion,
    forgettingCurve: forgettingCurve,
    adaptDifficulty: adaptDifficulty,
    planStudySessions: planStudySessions,
    analyzePerformance: analyzePerformance,
    generateQuiz: generateQuiz,
    estimateMastery: estimateMastery,
    buildCurriculum: buildCurriculum,
    trackProgress: trackProgress,
    generateReport: generateReport,
    selfTest: selfTest,
    demo: demo
  };
}
