/**
 * Growth Point App – メインアプリケーション
 * 全体のUI制御、イベント管理、Chart.js描画を担当
 */

import { calculateDailyPoints, calculateLevel, checkMissionCompletion } from './points.js';
import store from './store.js';
import { signInWithGoogle, signOut, getCurrentUser, handleRedirectResult } from './firebase.js';
// import { GoogleGenerativeAI } from '@google/generative-ai'; // Removed for security, now using backend API

// const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel);
const loginScreen = $('#login-screen');
const appScreen = $('#app');

// ===== アプリ初期化 =====
class GrowthPointApp {
  constructor() {
    this.chart = null;
    this.init();
  }

  async init() {
    this.bindEvents();
    this.updateGreeting();

    // リダイレクトログイン後の結果を処理
    try {
      const redirectUser = await handleRedirectResult();
      if (redirectUser) {
        await this.showApp();
        this.showToast('success', `${redirectUser.displayName || 'ユーザー'}さん、おかえりなさい！`);
        return;
      }
    } catch (error) {
      console.error('Redirect result error:', error);
      this.showToast('error', 'ログインに失敗しました: ' + error.message);
    }

    // セッション確認
    const user = await getCurrentUser();
    if (user) {
      this.showApp();
    } else {
      this.showLogin();
    }
  }

  // --- イベントバインド ---
  bindEvents() {
    // ログイン・ログアウト
    $('#btn-login').addEventListener('click', () => this.login());
    $('#btn-demo').addEventListener('click', () => this.login()); // デモも一旦ログインへ
    $('#user-avatar').addEventListener('click', () => {
      if (confirm('ログアウトしますか？')) signOut();
    });

    // クイックアクション
    $('#action-morning').addEventListener('click', () => this.openModal('modal-morning'));
    $('#action-study').addEventListener('click', () => this.openModal('modal-study'));
    $('#action-exchange').addEventListener('click', () => this.openModal('modal-exchange'));
    $('#btn-exchange').addEventListener('click', () => this.openModal('modal-exchange'));

    // モーダル操作
    $('#btn-morning-cancel').addEventListener('click', () => this.closeModal('modal-morning'));
    $('#btn-morning-submit').addEventListener('click', () => this.submitMorningCheckin());
    $('#btn-study-cancel').addEventListener('click', () => this.closeModal('modal-study'));
    $('#btn-study-submit').addEventListener('click', () => this.submitStudyLog());
    $('#btn-exchange-cancel').addEventListener('click', () => this.closeModal('modal-exchange'));
    $('#btn-exchange-submit').addEventListener('click', () => this.submitExchange());

    // ファイルアップロード
    const uploadArea = $('#upload-area');
    const fileInput = $('#study-image');
    if (uploadArea) {
      uploadArea.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleImageUpload(e));

      // ドラッグ＆ドロップ
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });
      uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
      });
      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files[0]) {
          fileInput.files = e.dataTransfer.files;
          this.handleImageUpload({ target: fileInput });
        }
      });
    }

    // モーダルの背景クリックで閉じる
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // 交換ポイント入力時のサマリー更新
    $('#exchange-amount').addEventListener('input', () => this.updateExchangeSummary());
  }

  // --- 画面切り替え ---
  showLogin() {
    loginScreen.style.display = 'flex';
    appScreen.style.display = 'none';
  }

  async showApp() {
    loginScreen.style.display = 'none';
    appScreen.style.display = 'block';
    await this.refreshDashboard();
  }

  // --- ログイン ---
  async login() {
    try {
      await signInWithGoogle();
      // signInWithRedirectはページをリダイレクトするため、以降の処理はinit()で行う
    } catch (error) {
      console.error('Login error:', error);
      this.showToast('error', 'ログインに失敗しました: ' + error.message);
    }
  }

  // --- ダッシュボード更新 ---
  async refreshDashboard() {
    const stats = await store.getUserStats();
    if (!stats) return;

    const levelInfo = calculateLevel(stats.totalPoints);

    // Stats
    $('#stat-points').textContent = stats.total_points?.toLocaleString() || '0';
    $('#stat-streak').textContent = stats.current_streak || '0';
    $('#stat-today-minutes').textContent = stats.todayMinutes || '0';
    $('#stat-level').textContent = `Lv.${levelInfo.level}`;
    const levelTitleEl = $('#stat-level-title');
    levelTitleEl.textContent = levelInfo.title;

    // Streak Evolution UI
    const streakVal = stats.current_streak || 0;
    const streakIcon = $('.stat-card--streak .stat-card__icon');
    if (streakIcon) {
      streakIcon.classList.remove('streak-evolution--warm', 'streak-evolution--rainbow');
      if (streakVal >= 14) {
        streakIcon.classList.add('streak-evolution--rainbow');
        streakIcon.innerHTML = '👑'; // Legendary
      } else if (streakVal >= 7) {
        streakIcon.classList.add('streak-evolution--warm');
        streakIcon.innerHTML = '🔥'; // On fire
      } else {
        streakIcon.innerHTML = '🌅'; // Calm morning
      }
    }

    // Nav points
    $('#nav-total-points').textContent = stats.total_points?.toLocaleString() || '0';
    
    // Avatar
    const user = await getCurrentUser();
    if (user && user.photoURL) {
      $('#user-avatar').innerHTML = `<img src="${user.photoURL}" style="width:100%; height:100%; border-radius:50%;">`;
    }

    // Level progress
    $('#level-progress').style.width = `${levelInfo.progressPercent}%`;
    $('#level-progress-text').textContent = `次のレベルまで ${levelInfo.pointsToNext - levelInfo.currentPoints} pt`;

    // Chart
    this.renderChart(stats.last7Days);

    // Missions
    await this.renderMissions(stats);

    // Activity
    await this.renderActivity();
  }

  // --- グラフ描画 ---
  renderChart(data) {
    const ctx = $('#weekly-chart');
    if (!ctx) return;
    if (this.chart) {
      this.chart.destroy();
    }

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [
          {
            label: '学習時間（分）',
            data: data.map(d => d.minutes),
            backgroundColor: 'rgba(99, 102, 241, 0.6)',
            borderColor: 'rgba(99, 102, 241, 1)',
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            label: '獲得ポイント',
            data: data.map(d => d.points),
            type: 'line',
            borderColor: 'rgba(16, 185, 129, 1)',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            pointBackgroundColor: 'rgba(16, 185, 129, 1)',
            pointRadius: 5,
            tension: 0.3,
            fill: true,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            labels: { color: '#94a3b8', font: { family: 'Inter' } }
          }
        },
        scales: {
          x: {
            ticks: { color: '#64748b' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            position: 'left',
            title: { display: true, text: '学習時間（分）', color: '#94a3b8' },
            ticks: { color: '#64748b' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y1: {
            position: 'right',
            title: { display: true, text: 'ポイント', color: '#94a3b8' },
            ticks: { color: '#64748b' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  // --- ミッション描画 ---
  async renderMissions(stats) {
    const missions = await store.getMissions();
    const container = $('#missions-list');
    if (!container) return;
    container.innerHTML = '';

    for (const mission of missions.slice(0, 6)) {
      const status = checkMissionCompletion(
        {
          currentStreak: stats.current_streak,
          totalStudyMinutes: stats.total_study_minutes,
          totalPoints: stats.total_points,
          uniqueTopics: stats.unique_topics?.length || 0
        },
        mission
      );

      const isCompleted = mission.isCompleted || status.completed;
      const progressPct = Math.floor(status.progress * 100);

      const el = document.createElement('div');
      el.className = `mission-item ${isCompleted ? 'mission-item--completed' : ''}`;
      el.innerHTML = `
        <div class="mission-item__check">${isCompleted ? '✅' : ''}</div>
        <div class="mission-item__content">
          <div class="mission-item__title">${mission.title}</div>
          <div class="mission-item__progress">${isCompleted ? '達成済み!' : `${status.current} / ${status.target} (${progressPct}%)`}</div>
        </div>
        <div class="mission-item__reward">+${mission.pointReward}pt</div>
      `;

      if (!mission.isCompleted && status.completed) {
        await store.completeMission(mission.id);
        const currentPoints = stats.total_points || 0;
        await store.saveUser({ total_points: currentPoints + mission.pointReward });
        await store.addPointTransaction({
          amount: mission.pointReward,
          reason: `ミッション達成: ${mission.title}`
        });
        this.showToast('success', `🎯 ミッション達成！「${mission.title}」+${mission.pointReward}pt`);
      }

      container.appendChild(el);
    }
  }

  // --- アクティビティ描画 ---
  async renderActivity() {
    const txns = await store.getPointTransactions();
    const container = $('#activity-list');
    if (!container) return;
    container.innerHTML = '';

    const recentTxns = txns.slice(0, 5);

    if (recentTxns.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 32px; color: var(--color-text-muted);">まだ記録がありません。学習を始めましょう！ 🚀</div>';
      return;
    }

    recentTxns.forEach(txn => {
      const date = new Date(txn.created_at);
      const dateStr = date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const el = document.createElement('div');
      el.className = 'mission-item';
      el.innerHTML = `
        <div style="font-size: 1.5rem;">💎</div>
        <div class="mission-item__content">
          <div class="mission-item__title">${txn.reason}</div>
          <div class="mission-item__progress">${dateStr}</div>
        </div>
        <div class="mission-item__reward" style="color: ${txn.amount >= 0 ? 'var(--color-accent-success)' : 'var(--color-accent-danger)'};">
          ${txn.amount >= 0 ? '+' : ''}${txn.amount}pt
        </div>
      `;
      container.appendChild(el);
    });
  }

  // --- 挨拶の時間帯判定 ---
  async updateGreeting() {
    const hour = new Date().getHours();
    const el = $('#greeting');
    if (!el) return;

    let text = '';
    if (hour < 5) {
      text = '深夜まで頑張っていますね 🌙';
    } else if (hour < 10) {
      text = 'おはようございます ☀️ 今日も良い朝！';
    } else if (hour < 17) {
      text = 'こんにちは 🌤️ 学び続けましょう';
    } else {
      text = 'こんばんは 🌙 今日の振り返りを';
    }

    const user = await getCurrentUser();
    if (user) {
      el.innerHTML = `<span class="hero__greeting-user">${user.displayName || 'ユーザー'}さん、</span>${text}`;
    } else {
      el.textContent = text;
    }
  }

  // --- モーダル制御 ---
  openModal(id) {
    $(`#${id}`).classList.add('active');
  }

  closeModal(id) {
    $(`#${id}`).classList.remove('active');
  }

  // --- 朝活チェックイン ---
  async submitMorningCheckin() {
    const wakeUp = $('#wake-up-time').value;
    const target = $('#target-wake-time').value;

    if (!wakeUp || !target) {
      this.showToast('error', '⚠️ 時間を入力してください');
      return;
    }

    const wakeUpDate = new Date(`2024-01-01T${wakeUp}:00`);
    const targetDate = new Date(`2024-01-01T${target}:00`);

    const stats = await store.getUserStats();
    
    const result = calculateDailyPoints({
      wakeUpTime: wakeUpDate,
      targetWakeUpTime: targetDate,
      durationMinutes: 0,
      isNewTopic: false,
      currentStreak: stats.current_streak || 0,
      aiVerified: false
    });

    const isEarly = wakeUpDate <= targetDate;

    if (isEarly) {
      const newStreak = (stats.current_streak || 0) + 1;
      const newPoints = (stats.total_points || 0) + result.total;
      
      await store.saveUser({
        current_streak: newStreak,
        total_points: newPoints,
        last_wake_up_at: new Date().toISOString()
      });
      
      await store.addPointTransaction({
        amount: result.total,
        reason: `🌅 朝活チェックイン（${wakeUp}起床）`
      });
      this.showToast('success', `🌅 早起き成功！ +${result.total}pt (${newStreak}日連続！)`);
    } else {
      this.showToast('info', `⏰ 目標時間を過ぎていますが、チェックインは完了です！明日は早起きしましょう 💪`);
    }

    this.closeModal('modal-morning');
    await this.refreshDashboard();
  }

  // --- 学習記録 ---
  async submitStudyLog() {
    const topic = $('#study-topic').value;
    const duration = parseInt($('#study-duration').value) || 0;
    const notes = $('#study-notes').value;

    if (duration < 5) {
      this.showToast('error', '⚠️ 学習時間は5分以上で入力してください');
      return;
    }

    const stats = await store.getUserStats();
    const isNewTopic = !(stats.unique_topics || []).includes(topic);

    const result = calculateDailyPoints({
      wakeUpTime: null,
      targetWakeUpTime: null,
      durationMinutes: duration,
      isNewTopic,
      currentStreak: stats.current_streak || 0,
      aiVerified: this.lastAiResult?.is_study_related || false
    });

    // データ保存
    const newTopics = isNewTopic 
      ? [...(stats.unique_topics || []), topic]
      : (stats.unique_topics || []);
      
    const newPoints = (stats.total_points || 0) + result.total;
    const newTotalMinutes = (stats.total_study_minutes || 0) + duration;

    await store.saveUser({
      unique_topics: newTopics,
      total_points: newPoints,
      total_study_minutes: newTotalMinutes
    });

    await store.addStudyLog({
      topic,
      durationMinutes: duration,
      notes,
      aiSummary: notes ? `学習内容: ${notes.slice(0, 50)}` : '学習を記録しました。',
      pointsEarned: result.total
    });

    await store.addPointTransaction({
      amount: result.total,
      reason: `📖 学習記録: ${topic}（${duration}分）`
    });

    // ポイントアニメーション
    const pointEl = $('#stat-points');
    if (pointEl) {
      pointEl.classList.add('animate-point-pop');
      setTimeout(() => pointEl.classList.remove('animate-point-pop'), 500);
    }

    this.showToast('success', `📖 +${result.total}pt！${topic}の学習を記録しました`);
    this.closeModal('modal-study');
    this.resetStudyForm();
    await this.refreshDashboard();
  }

  resetStudyForm() {
    $('#study-duration').value = 30;
    $('#study-notes').value = '';
    $('#study-image').value = '';
    const preview = $('#upload-preview');
    const aiResult = $('#ai-result');
    if (preview) preview.style.display = 'none';
    if (aiResult) aiResult.style.display = 'none';
  }

  // --- 画像アップロード ---
  handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const previewImg = $('#preview-img');
      const uploadPreview = $('#upload-preview');
      if (previewImg) previewImg.src = ev.target.result;
      if (uploadPreview) uploadPreview.style.display = 'block';

      // AI判定（実際のAPI呼び出し）
      this.verifyImageWithAI(file, $('#study-topic').value, $('#study-notes').value);
    };
    reader.readAsDataURL(file);
  }

  // --- AI学習証明 バックエンド API呼び出し ---
  async verifyImageWithAI(file, topic, notes) {
    const aiResult = $('#ai-result');
    if (!aiResult) return;

    aiResult.style.display = 'block';
    
    // Iris Scan Animation Trigger
    const irisScan = $('#iris-scan');
    if (irisScan) irisScan.classList.add('active');

    const loadingPhases = [
      'タイマーを検出中...',
      '学習領域を特定中...',
      '情報の整合性を検証中...',
      '思考の軌跡を解析中...'
    ];
    let phaseIdx = 0;

    const interval = setInterval(() => {
      if (phaseIdx < loadingPhases.length) {
        aiResult.innerHTML = `
          <div class="ai-result">
            <div class="ai-result__header">🤖 AI エボリューション解析中</div>
            <div class="ai-result__summary">${loadingPhases[phaseIdx]}</div>
          </div>
        `;
        phaseIdx++;
      } else {
        clearInterval(interval);
      }
    }, 800);

    try {
      clearInterval(interval);
      if (irisScan) irisScan.classList.remove('active');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('topic', topic);
      formData.append('notes', notes);

      const response = await fetch('/api/verify-study', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('API request failed');
      
      const result = await response.json();
      this.lastAiResult = result;

      if (result.is_study_related) {
        aiResult.innerHTML = `
          <div class="ai-result">
            <div class="ai-result__header">🤖 AI学習証明 (Proof of Learning)</div>
            <div class="ai-result__summary">
              <strong>${result.summary}</strong><br>
              ${result.reason}
            </div>
            <div class="ai-result__points">🎉 AIボーナス対象 (+10pt)</div>
          </div>
        `;
      } else {
        aiResult.innerHTML = `
          <div class="ai-result ai-result--error">
            <div class="ai-result__header">❌ 学習証明ならず</div>
            <div class="ai-result__summary">${result.reason}</div>
          </div>
        `;
      }
    } catch (error) {
      console.error('AI Error:', error);
      aiResult.innerHTML = `
        <div class="ai-result ai-result--error">
          <div class="ai-result__header">⚠️ 分析エラー</div>
          <div class="ai-result__summary">AI判定中にエラーが発生しました。バックエンドの状態を確認してください。</div>
        </div>
      `;
    }
  }

  // --- ポイント交換 ---
  updateExchangeSummary() {
    const amount = parseInt($('#exchange-amount').value) || 0;
    const dPoints = Math.floor(amount / 100) * 50;
    const summary = $('#exchange-summary');
    if (!summary) return;
    if (amount >= 100) {
      summary.style.display = 'block';
      summary.innerHTML = `
        <div class="ai-result">
          <div class="ai-result__header">📋 交換サマリー</div>
          <div class="ai-result__summary">
            アプリ内ポイント: <strong>${amount} pt</strong><br>
            交換後dポイント: <strong>${dPoints} dポイント</strong>
          </div>
        </div>
      `;
    } else {
      summary.style.display = 'none';
    }
  }

  async submitExchange() {
    const amount = parseInt($('#exchange-amount').value) || 0;
    const email = $('#exchange-email').value;
    const stats = await store.getUserStats();

    if (amount < 100) {
      this.showToast('error', '⚠️ 最低100ポイントから交換可能です');
      return;
    }
    if ((stats.total_points || 0) < amount) {
      this.showToast('error', `⚠️ ポイントが不足しています（現在: ${stats.total_points}pt）`);
      return;
    }
    if (!email) {
      this.showToast('error', '⚠️ メールアドレスを入力してください');
      return;
    }

    const dPoints = Math.floor(amount / 100) * 50;
    const newPoints = (stats.total_points || 0) - amount;
    
    await store.saveUser({ total_points: newPoints });
    await store.addPointTransaction({
      amount: -amount,
      reason: `🎁 dポイント交換申請（${dPoints} dポイント）`
    });

    this.showToast('success', `🎁 ${dPoints} dポイントの交換申請を受け付けました！メールをご確認ください。`);
    this.closeModal('modal-exchange');
    await this.refreshDashboard();
  }

  // --- トースト通知 ---
  showToast(type, message) {
    const toast = $('#toast');
    const icon = $('#toast-icon');
    const msg = $('#toast-message');
    if (!toast) return;

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    icon.textContent = icons[type] || '✅';
    msg.textContent = message;

    toast.className = `toast toast--${type} show`;
    setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }
}

// ===== アプリ起動 =====
document.addEventListener('DOMContentLoaded', () => {
  new GrowthPointApp();
});
