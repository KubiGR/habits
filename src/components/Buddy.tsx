import { useState } from 'react'
import { buddyMood, type Mood } from '../lib/buddy'
import type { Data, Habit } from '../lib/data'
import { cls } from '../lib/dom'
import { playPurr } from '../lib/sound'
import { formatRate } from '../lib/stats'

const LINE: Record<Mood, string> = {
  new: 'Hi! Add a habit and I’ll keep you company.',
  resting: 'Nothing due today. Nap time.',
  sad: 'I miss you. Even one habit would cheer me up.',
  meh: 'A little restless. Let’s get one done?',
  content: 'Doing fine. Keep it going.',
  happy: 'Purring. You’ve been showing up.',
  ecstatic: 'All done! Best day ever.',
}

const FEELING: Record<Mood, string> = {
  new: 'curious',
  resting: 'napping',
  sad: 'sad',
  meh: 'restless',
  content: 'content',
  happy: 'happy',
  ecstatic: 'overjoyed',
}

interface Props {
  habits: Habit[]
  checks: Data['checks']
  today: string
}

/** A cat that lives next to today's list. It's as happy as your last week, and lights up when today is done. */
export function Buddy({ habits, checks, today }: Props) {
  const { mood, recent } = buddyMood(habits, checks, today)
  const [pets, setPets] = useState(0)

  function pet() {
    setPets((n) => n + 1)
    playPurr()
  }

  return (
    <aside className={cls('buddy', mood)}>
      <button type="button" className="cat" onClick={pet} aria-label={`Your buddy is ${FEELING[mood]}. Pet it`}>
        <Cat mood={mood} />
        {pets > 0 && (
          <span key={pets} className="pet-heart" aria-hidden="true">
            ♥
          </span>
        )}
        {mood === 'ecstatic' && (
          <span className="joy" aria-hidden="true">
            <span>♥</span>
            <span>♥</span>
          </span>
        )}
        {mood === 'resting' && (
          <span className="zzz" aria-hidden="true">
            z<span>z</span>
          </span>
        )}
      </button>
      <div className="buddy-words">
        <p className="buddy-line" aria-live="polite">
          {LINE[mood]}
        </p>
        {recent !== null && <p className="buddy-meta">Last 7 days {formatRate(recent)}</p>}
      </div>
    </aside>
  )
}

/** Line art, drawn in the page's ink so it follows light and dark. CSS animates the named parts. */
function Cat({ mood }: { mood: Mood }) {
  const smiling = mood === 'happy' || mood === 'ecstatic'
  return (
    <svg viewBox="0 0 120 110" aria-hidden="true">
      <path className="tail" d={mood === 'sad' ? 'M84 100 C98 104 106 104 112 101' : 'M84 98 C104 98 110 80 100 68'} />
      <g className="body">
        <path className="fill" d="M34 104 C30 80 38 62 60 62 C82 62 90 80 86 104 Z" />
        <path d="M46 104 q0 -6 6 -6 q6 0 6 6 M62 104 q0 -6 6 -6 q6 0 6 6" />
      </g>
      <g className="head">
        <path className="fill ear ear-l" d="M42 30 L38 10 L57 22" />
        <path className="fill ear ear-r" d="M78 30 L82 10 L63 22" />
        <ellipse className="fill" cx="60" cy="42" rx="27" ry="24" />
        <path className="whiskers" d="M35 45 h-12 M35 50 l-11 3 M85 45 h12 M85 50 l11 3" />
        {smiling && (
          <g className="cheeks">
            <circle cx="43" cy="50" r="3.5" />
            <circle cx="77" cy="50" r="3.5" />
          </g>
        )}
        <Eyes mood={mood} />
        <path className="nose" d="M57.5 47 h5 l-2.5 3 z" />
        <path d={MOUTH[mood]} />
        {mood === 'sad' && <path className="tear" d="M47 47 q-2 4 0 5.5 q2 -1.5 0 -5.5 z" />}
      </g>
    </svg>
  )
}

const MOUTH: Record<Mood, string> = {
  new: 'M55 53 q2.5 2.5 5 0 q2.5 2.5 5 0',
  resting: 'M58 53 q2 1.5 4 0',
  sad: 'M55 56 q5 -4 10 0',
  meh: 'M56 54 h8',
  content: 'M55 53 q2.5 2.5 5 0 q2.5 2.5 5 0',
  happy: 'M54 52 q3 4 6 0 q3 4 6 0',
  ecstatic: 'M54 52 q6 9 12 0 z',
}

function Eyes({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'happy':
    case 'ecstatic':
      return <path d="M45 42 q5 -6 10 0 M65 42 q5 -6 10 0" />
    case 'resting':
      return <path d="M45 41 q5 4 10 0 M65 41 q5 4 10 0" />
    case 'meh':
      return <path d="M45 41 h10 M65 41 h10 M47 43 q3 2 6 0 M67 43 q3 2 6 0" />
    case 'sad':
      return (
        <>
          <path d="M44 37 l9 -4 M76 37 l-9 -4" />
          <circle className="eye" cx="50" cy="42" r="2.6" />
          <circle className="eye" cx="70" cy="42" r="2.6" />
        </>
      )
    default:
      return (
        <>
          <circle className="eye" cx="50" cy="41" r="3" />
          <circle className="eye" cx="70" cy="41" r="3" />
        </>
      )
  }
}
