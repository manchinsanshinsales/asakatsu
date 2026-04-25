/**
 * Growth Point App – ポイント計算ロジック
 * 朝活・学習活動をポイントに変換するコアエンジン
 */

/**
 * 獲得ポイント算出ロジック
 * @param {Object} session - 学習セッション情報
 * @param {Date} session.wakeUpTime - 実際の起床時間
 * @param {Date} session.targetWakeUpTime - 目標時間（例：07:00）
 * @param {number} session.durationMinutes - 勉強時間（分）
 * @param {boolean} session.isNewTopic - 新しいカテゴリかどうか
 * @param {number} session.currentStreak - 現在の連続達成日数
 * @param {boolean} session.aiVerified - AIによる学習証明がされたか
 * @returns {Object} ポイント詳細
 */
export function calculateDailyPoints(session) {
  // 1. バリデーション
  if (session.durationMinutes > 480) {
    throw new Error("学習時間が長すぎます（最大8時間）。分割して記録してください。");
  }
  if (session.durationMinutes < 0) {
    return { total: 0, breakdown: [] };
  }

  const breakdown = [];
  let basePoints = 0;

  // 2. 早起きボーナス（目標時間前に起床 → 10pt）
  if (session.wakeUpTime && session.targetWakeUpTime) {
    if (session.wakeUpTime <= session.targetWakeUpTime) {
      basePoints += 10;
      breakdown.push({ label: "🌅 早起きボーナス", points: 10 });
    }
  }

  // 3. 学習時間ポイント（15分ごとに1pt）
  const studyPoints = Math.floor(session.durationMinutes / 15);
  if (studyPoints > 0) {
    basePoints += studyPoints;
    breakdown.push({ label: "📖 学習時間", points: studyPoints });
  }

  // 4. 新規トピックボーナス（+5pt）
  if (session.isNewTopic) {
    basePoints += 5;
    breakdown.push({ label: "🆕 新規トピック", points: 5 });
  }

  // 5. AI学習証明ボーナス（+10pt）
  if (session.aiVerified) {
    basePoints += 10;
    breakdown.push({ label: "🤖 AI学習証明", points: 10 });
  }

  // 6. 継続倍率の適用（最大1.5倍）
  const multiplier = Math.min(1 + (session.currentStreak * 0.1), 1.5);
  const total = Math.floor(basePoints * multiplier);

  if (multiplier > 1) {
    breakdown.push({
      label: `🔥 ${session.currentStreak}日連続ボーナス (x${multiplier.toFixed(1)})`,
      points: total - basePoints
    });
  }

  return { total, multiplier, basePoints, breakdown };
}

/**
 * ミッション判定
 * @param {Object} userStats - ユーザーの統計
 * @param {Object} mission - ミッション定義
 * @returns {Object} 達成状況
 */
export function checkMissionCompletion(userStats, mission) {
  switch (mission.type) {
    case 'streak':
      return {
        completed: userStats.currentStreak >= mission.target,
        progress: Math.min(userStats.currentStreak / mission.target, 1),
        current: userStats.currentStreak,
        target: mission.target
      };
    case 'total_study_hours':
      const hours = userStats.totalStudyMinutes / 60;
      return {
        completed: hours >= mission.target,
        progress: Math.min(hours / mission.target, 1),
        current: Math.floor(hours),
        target: mission.target
      };
    case 'total_points':
      return {
        completed: userStats.totalPoints >= mission.target,
        progress: Math.min(userStats.totalPoints / mission.target, 1),
        current: userStats.totalPoints,
        target: mission.target
      };
    case 'topic_count':
      return {
        completed: userStats.uniqueTopics >= mission.target,
        progress: Math.min(userStats.uniqueTopics / mission.target, 1),
        current: userStats.uniqueTopics,
        target: mission.target
      };
    default:
      return { completed: false, progress: 0, current: 0, target: mission.target };
  }
}

/**
 * レベル計算（累計ポイントからレベルを算出）
 * @param {number} totalPoints - 累計ポイント
 * @returns {Object} レベル情報
 */
export function calculateLevel(totalPoints) {
  // レベルごとに必要なポイントが増加（100, 250, 450, 700...）
  let level = 1;
  let pointsForNext = 100;
  let accumulatedPoints = 0;

  while (totalPoints >= accumulatedPoints + pointsForNext) {
    accumulatedPoints += pointsForNext;
    level++;
    pointsForNext = Math.floor(100 * (1 + (level - 1) * 0.5));
  }

  const currentLevelProgress = totalPoints - accumulatedPoints;
  const progressPercent = Math.floor((currentLevelProgress / pointsForNext) * 100);

  const levelTitles = [
    '', 'ビギナー', 'ルーキー', 'アクティブ', 'チャレンジャー',
    'エキスパート', 'マスター', 'レジェンド', 'ゴッドハンド', 'グランドマスター', '覚醒者'
  ];

  return {
    level,
    title: levelTitles[Math.min(level, levelTitles.length - 1)],
    currentPoints: currentLevelProgress,
    pointsToNext: pointsForNext,
    progressPercent,
    totalPoints
  };
}
