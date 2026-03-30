import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import {
  DAILY_CHECKIN_REWARD,
  claimDailyCheckIn,
  getMissionStatuses,
  getMsUntilNextDailyReset,
  loadProgressionState,
  saveProgressionState,
  type ProgressionState,
} from '../lib/progression'
import { getAchievements } from '../lib/achievements'

function formatCoins(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(value)))
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function MissionsPage() {
  const [progression, setProgression] = useState<ProgressionState | null>(null)
  const [checkInMessage, setCheckInMessage] = useState('')
  const [msUntilReset, setMsUntilReset] = useState(() => getMsUntilNextDailyReset())

  useEffect(() => {
    setProgression(loadProgressionState())
  }, [])

  useEffect(() => {
    const tick = () => setMsUntilReset(getMsUntilNextDailyReset())
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const missionStatuses = useMemo(() => {
    if (!progression) return { daily: [], weekly: [] as ReturnType<typeof getMissionStatuses>['weekly'] }
    return getMissionStatuses(progression)
  }, [progression])

  const achievements = useMemo(() => {
    if (!progression) return []
    return getAchievements(progression)
  }, [progression])

  function handleDailyCheckIn() {
    if (!progression) return
    const outcome = claimDailyCheckIn(progression)
    saveProgressionState(outcome.nextState)
    setProgression(outcome.nextState)
    if (outcome.claimed) {
      setCheckInMessage(`Daily check-in claimed: +${formatCoins(outcome.reward)} coins.`)
    } else {
      setCheckInMessage('Daily check-in already claimed. Come back tomorrow.')
    }
  }

  return (
    <Layout title="Rip Realm | Missions" description="Track daily and weekly mission progress in Rip Realm.">
      <section className="profile-wrap">
        <h1 className="profile-title">Missions</h1>
        <p className="profile-subtitle">Daily and weekly goals are now in their own section for a cleaner opener flow.</p>

        <div className="profile-economy-row">
          <div className="profile-economy-card">
            <span>Currency</span>
            <strong>{formatCoins(progression?.currency || 0)} coins</strong>
          </div>
          <div className="profile-economy-card">
            <span>Check-in Streak</span>
            <strong>{formatCoins(progression?.stats.checkInStreak || 0)} days</strong>
          </div>
        </div>

        <div className="missions-panel">
          <div className="missions-head">Daily Check-in</div>
          <button
            type="button"
            className="ghost-button daily-checkin-btn"
            onClick={handleDailyCheckIn}
            disabled={Boolean(progression?.daily.checkInClaimed)}
          >
            {progression?.daily.checkInClaimed ? 'Daily Check-in Claimed' : `Claim Daily Check-in +${DAILY_CHECKIN_REWARD}`}
          </button>
          <div className="daily-checkin-note">
            {progression?.daily.checkInClaimed ? 'Next daily check-in in ' : 'Daily reset in '}
            <strong>{formatCountdown(msUntilReset)}</strong>
          </div>
          {checkInMessage ? <div className="daily-checkin-note">{checkInMessage}</div> : null}
        </div>

        <div className="missions-panel" style={{ marginTop: '10px' }}>
          <div className="missions-head">Daily Missions</div>
          {missionStatuses.daily.map((mission) => {
            const ratio = Math.min(100, Math.round((mission.progress / mission.target) * 100))
            return (
              <div key={mission.id} className="mission-row">
                <div className="mission-label-line">
                  <span className="mission-label">{mission.label}</span>
                  <span className="mission-progress">{mission.progress}/{mission.target}</span>
                </div>
                <div className="mission-track"><span style={{ width: `${ratio}%` }} /></div>
                <div className="mission-reward">+{mission.reward} coins {mission.completed ? '• Complete' : ''}</div>
              </div>
            )
          })}
        </div>

        <div className="missions-panel weekly-panel" style={{ marginTop: '10px' }}>
          <div className="missions-head">Weekly Missions</div>
          {missionStatuses.weekly.map((mission) => {
            const ratio = Math.min(100, Math.round((mission.progress / mission.target) * 100))
            return (
              <div key={mission.id} className="mission-row">
                <div className="mission-label-line">
                  <span className="mission-label">{mission.label}</span>
                  <span className="mission-progress">{mission.progress}/{mission.target}</span>
                </div>
                <div className="mission-track"><span style={{ width: `${ratio}%` }} /></div>
                <div className="mission-reward">+{mission.reward} coins {mission.completed ? '• Complete' : ''}</div>
              </div>
            )
          })}
        </div>

        <section className="achievement-panel" style={{ marginTop: '12px' }}>
          <div className="panel-head">
            <h2>Achievement Progress</h2>
            <span>{achievements.filter((item) => item.unlocked).length}/{achievements.length} unlocked</span>
          </div>
          <div className="achievement-grid">
            {achievements.map((achievement) => (
              <article key={achievement.id} className={`achievement-item ${achievement.unlocked ? 'is-unlocked' : 'is-locked'}`}>
                <strong>{achievement.label}</strong>
                <p>{achievement.description}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </Layout>
  )
}
