/**
 * Growth Point App – データストア（Firestore 移行版）
 */

import { db, getCurrentUser } from './firebase.js';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  limit
} from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js';

// --- デフォルトのミッション一覧 ---
const DEFAULT_MISSIONS = [
  { id: 1, title: '🌅 初めての早起きチェック', type: 'streak', target: 1, pointReward: 20, category: 'morning' },
  { id: 2, title: '🔥 3日連続早起き', type: 'streak', target: 3, pointReward: 50, category: 'morning' },
  { id: 3, title: '⚡ 7日連続早起き', type: 'streak', target: 7, pointReward: 150, category: 'morning' },
  { id: 4, title: '📖 累計5時間学習', type: 'total_study_hours', target: 5, pointReward: 30, category: 'study' },
  { id: 5, title: '📚 累計20時間学習', type: 'total_study_hours', target: 20, pointReward: 100, category: 'study' },
  { id: 6, title: '🏆 累計100時間学習', type: 'total_study_hours', target: 100, pointReward: 500, category: 'study' },
  { id: 7, title: '🆕 3つのカテゴリを学習', type: 'topic_count', target: 3, pointReward: 40, category: 'explore' },
  { id: 8, title: '🌍 5つのカテゴリを学習', type: 'topic_count', target: 5, pointReward: 80, category: 'explore' },
  { id: 9, title: '💎 累計500ポイント到達', type: 'total_points', target: 500, pointReward: 100, category: 'milestone' },
  { id: 10, title: '👑 累計1000ポイント到達', type: 'total_points', target: 1000, pointReward: 200, category: 'milestone' },
];

/**
 * Firestore 連携用ストア
 */
class Store {
  // ユーザープロフィール取得
  async getUser() {
    const user = await getCurrentUser();
    if (!user) return null;

    const docRef = doc(db, 'profiles', user.uid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      // プロファイルがない場合は初期作成
      const initialProfile = {
        id: user.uid,
        email: user.email,
        nickname: user.displayName || 'ユーザー',
        total_points: 0,
        current_streak: 0,
        total_study_minutes: 0,
        unique_topics: [],
        created_at: serverTimestamp()
      };
      await setDoc(docRef, initialProfile);
      return initialProfile;
    }

    const profile = docSnap.data();
    return {
      ...profile,
      nickname: profile.nickname || user.displayName || 'ユーザー'
    };
  }

  async saveUser(profileUpdates) {
    const user = await getCurrentUser();
    if (!user) return;

    const docRef = doc(db, 'profiles', user.uid);
    await updateDoc(docRef, {
      ...profileUpdates,
      updated_at: serverTimestamp()
    });
  }

  // 学習ログ取得
  async getStudyLogs() {
    const user = await getCurrentUser();
    if (!user) return [];

    const q = query(
      collection(db, 'study_logs'), 
      where('user_id', '==', user.uid),
      orderBy('created_at', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: doc.data().created_at?.toDate() || new Date()
    }));
  }

  async addStudyLog(log) {
    const user = await getCurrentUser();
    if (!user) return;

    const docRef = await addDoc(collection(db, 'study_logs'), {
      user_id: user.uid,
      topic: log.topic,
      duration_minutes: log.durationMinutes,
      notes: log.notes,
      ai_summary: log.aiSummary,
      points_earned: log.pointsEarned,
      created_at: serverTimestamp()
    });

    return { id: docRef.id };
  }

  // ポイントトランザクション取得
  async getPointTransactions() {
    const user = await getCurrentUser();
    if (!user) return [];

    const q = query(
      collection(db, 'point_transactions'), 
      where('user_id', '==', user.uid),
      orderBy('created_at', 'desc'),
      limit(50)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: doc.data().created_at?.toDate() || new Date()
    }));
  }

  async addPointTransaction(transaction) {
    const user = await getCurrentUser();
    if (!user) return;

    const docRef = await addDoc(collection(db, 'point_transactions'), {
      user_id: user.uid,
      amount: transaction.amount,
      reason: transaction.reason,
      created_at: serverTimestamp()
    });

    return { id: docRef.id };
  }

  // ミッション進捗取得
  async getMissions() {
    const user = await getCurrentUser();
    if (!user) return DEFAULT_MISSIONS;

    const q = query(collection(db, 'user_missions'), where('user_id', '==', user.uid));
    const querySnapshot = await getDocs(q);
    const userMissions = querySnapshot.docs.map(doc => doc.data());

    return DEFAULT_MISSIONS.map(m => {
      const userM = userMissions.find(um => um.mission_id === m.id);
      return {
        ...m,
        isCompleted: userM ? userM.is_completed : false,
        completedAt: userM ? userM.completed_at?.toDate() : null
      };
    });
  }

  async completeMission(missionId) {
    const user = await getCurrentUser();
    if (!user) return;

    const missionRef = doc(db, 'user_missions', `${user.uid}_${missionId}`);
    await setDoc(missionRef, {
      user_id: user.uid,
      mission_id: missionId,
      is_completed: true,
      completed_at: serverTimestamp()
    }, { merge: true });
  }

  // 統計情報取得
  async getUserStats() {
    const user = await this.getUser();
    if (!user) return null;

    const logs = await this.getStudyLogs();
    const today = new Date().toDateString();

    const todayLogs = logs.filter(l => l.created_at.toDateString() === today);
    const todayMinutes = todayLogs.reduce((sum, l) => sum + (l.duration_minutes || 0), 0);

    // 過去7日間のデータ
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const dayLogs = logs.filter(l => l.created_at.toDateString() === dateStr);
      last7Days.push({
        date: d,
        label: d.toLocaleDateString('ja-JP', { weekday: 'short', month: 'numeric', day: 'numeric' }),
        minutes: dayLogs.reduce((sum, l) => sum + (l.duration_minutes || 0), 0),
        points: dayLogs.reduce((sum, l) => sum + (l.points_earned || 0), 0)
      });
    }

    return {
      ...user,
      todayMinutes,
      last7Days,
      totalLogs: logs.length
    };
  }
}

const store = new Store();
export default store;
export { DEFAULT_MISSIONS };
