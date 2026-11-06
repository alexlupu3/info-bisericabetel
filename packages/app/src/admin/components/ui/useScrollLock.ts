import { useLayoutEffect } from 'react'

/**
 * Locks document scrolling while at least one admin dialog is open (FR-110). Reference
 * counted so stacked dialogs (the media library over the content dialog) unlock only when
 * the last one closes. The scrollbar's width is added as padding so the page does not
 * shift sideways when the scrollbar disappears.
 */

let locks = 0
let saved: { overflow: string; paddingRight: string } | null = null

function lock() {
  locks += 1
  if (locks > 1) return
  const html = document.documentElement
  const scrollbar = window.innerWidth - html.clientWidth
  saved = { overflow: html.style.overflow, paddingRight: html.style.paddingRight }
  html.style.overflow = 'hidden'
  if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`
  html.dataset.scrollLocked = 'true'
}

function unlock() {
  locks = Math.max(0, locks - 1)
  if (locks > 0 || !saved) return
  const html = document.documentElement
  html.style.overflow = saved.overflow
  html.style.paddingRight = saved.paddingRight
  delete html.dataset.scrollLocked
  saved = null
}

export function useScrollLock(active = true) {
  useLayoutEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}
