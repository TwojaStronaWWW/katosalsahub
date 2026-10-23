import { parsujDateFB, formatujDatePL } from './utils.js?v=20261020_v3'

// --- INBOX HELPER ---

export function initInbox() {
	const HIDDEN_SHEET_URL =
		'https://docs.google.com/spreadsheets/d/1sI3oU5dNLhWsK0vcct069MENk-o-XuUh9UQ7k-O7Um8/edit?resourcekey=&gid=1833510316#gid=1833510316'

	const checkBtn = document.getElementById('check-inbox-btn')
	const container = document.getElementById('inbox-container')
	if (!checkBtn || !container) return

	checkBtn.addEventListener('click', () => {
		const url = HIDDEN_SHEET_URL

		checkBtn.disabled = true
		checkBtn.textContent = '⏳ Pobieranie...'

		let fetchUrl = url
		const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
		if (sheetMatch) {
			const id = sheetMatch[1]
			let gid = '0'
			const gidMatch = url.match(/[?&#]gid=([0-9]+)/)
			if (gidMatch) {
				gid = gidMatch[1]
			}
			fetchUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
		}

		fetch(fetchUrl)
			.then(r => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`)
				return r.text()
			})
			.then(csvText => {
				const rows = csvText
					.split('\n')
					.map(r => r.trim())
					.filter(r => r)

				const pendingItems = []
				const processed = JSON.parse(localStorage.getItem('party_inbox_done') || '[]')

				for (let i = 1; i < rows.length; i++) {
					const row = rows[i]
					const cols = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || row.split(',')
					const cleanCols = cols.map(c => c.replace(/^"|"$/g, '').trim())
					const linkIndex = cleanCols.findIndex(
						c => /^https?:\/\//i.test(c) && (c.includes('facebook.com') || c.includes('fb.me')),
					)

					if (linkIndex !== -1) {
						const link = cleanCols[linkIndex]
						const timestampStr = cleanCols[0]

						const today = new Date()
						today.setHours(0, 0, 0, 0)

						let bestFoundDate = null
						let shouldSkip = false

						for (const cell of cleanCols) {
							const d = parsujDateFB(cell)
							if (d) {
								if (d < today) {
									shouldSkip = true
									break
								}
								if (!bestFoundDate || d < bestFoundDate) {
									bestFoundDate = d
								}
							}
						}

						if (shouldSkip) continue

						const extraInfo = cleanCols.filter((c, idx) => idx !== 0 && idx !== linkIndex && c.length > 0).join(' | ')

						if (!processed.includes(link)) {
							const displayDate = bestFoundDate ? formatujDatePL(bestFoundDate) : timestampStr
							pendingItems.push({ date: displayDate, link, info: extraInfo })
						}
					}
				}

				renderInbox(pendingItems)
				checkBtn.disabled = false
				checkBtn.textContent = '🔄 Sprawdź'
			})
			.catch(err => {
				console.error(err)
				alert('Błąd pobierania CSV. Sprawdź czy link jest poprawny (musi być opublikowany jako CSV).')
				checkBtn.disabled = false
				checkBtn.textContent = '🔄 Sprawdź'
			})
	})

	function renderInbox(items) {
		container.innerHTML = ''
		if (items.length === 0) {
			container.innerHTML = '<div class="inbox-empty">Brak nowych zgłoszeń (lub wszystkie zatwierdzone).</div>'
			return
		}

		items.forEach(item => {
			const link = item.link
			const info = item.info

			const div = document.createElement('div')
			div.className = 'inbox-item'

			const headerDiv = document.createElement('div')
			headerDiv.className = 'inbox-item-header'
			headerDiv.textContent = item.date || 'Brak daty'
			div.appendChild(headerDiv)

			const contentDiv = document.createElement('div')
			contentDiv.className = 'inbox-item-content'

			const linkText = document.createElement('a')
			linkText.className = 'inbox-item-link'
			linkText.href = /^https?:\/\//i.test(link) ? link : '#'
			linkText.target = '_blank'
			linkText.rel = 'noopener noreferrer'
			linkText.textContent = link
			linkText.title = 'Kliknij, aby otworzyć i skopiować skrapera!'

			linkText.addEventListener('click', () => {
				if (window.scraperScriptCache) {
					navigator.clipboard.writeText(window.scraperScriptCache).then(() => {
						linkText.classList.add('is-copied')
						setTimeout(() => linkText.classList.remove('is-copied'), 1500)
					})
				} else {
					fetch('tools/fb_scraper.js')
						.then(r => r.text())
						.then(t => navigator.clipboard.writeText(t))
				}
			})

			contentDiv.appendChild(linkText)

			if (info) {
				const infoText = document.createElement('div')
				infoText.className = 'inbox-item-info'
				infoText.textContent = info
				contentDiv.appendChild(infoText)
			}

			div.appendChild(contentDiv)

			const actions = document.createElement('div')
			actions.className = 'inbox-item-actions'

			const btnDone = document.createElement('button')
			btnDone.type = 'button'
			btnDone.className = 'btn-inbox-done'
			btnDone.textContent = '✔️ Zatwierdź'
			btnDone.addEventListener('click', () => {
				markAsDone(link)
				div.remove()
				if (container.children.length === 0) {
					container.innerHTML = '<div class="inbox-empty">Wszystko zrobione! 🎉</div>'
				}
			})

			actions.append(btnDone)
			div.append(actions)
			container.append(div)
		})
	}

	function markAsDone(link) {
		const processed = JSON.parse(localStorage.getItem('party_inbox_done') || '[]')
		if (!processed.includes(link)) {
			processed.push(link)
			localStorage.setItem('party_inbox_done', JSON.stringify(processed))
		}
	}
}

// --- HELPERS TYTUŁOWE & GENERATOR POSTÓW ---

export function toBoldUnicode(text) {
	const chars = {
		a: '𝐚', b: '𝐛', c: '𝐜', d: '𝐝', e: '𝐞', f: '𝐟', g: '𝐠', h: '𝐡', i: '𝐢', j: '𝐣', k: '𝐤', l: '𝐥', m: '𝐦',
		n: '𝐧', o: '𝐨', p: '𝐩', q: '𝐪', r: '𝐫', s: '𝐬', t: '𝐭', u: '𝐮', v: '𝐯', w: '𝐰', x: '𝐱', y: '𝐲', z: '𝐳',
		A: '𝐀', B: '𝐁', C: '𝐂', D: '𝐃', E: '𝐄', F: '𝐅', G: '𝐆', H: '𝐇', I: '𝐈', J: '𝐉', K: '𝐊', L: '𝐋', M: '𝐌',
		N: '𝐍', O: '𝐎', P: '𝐏', Q: '𝐐', R: '𝐑', S: '𝐒', T: '𝐓', U: '𝐔', V: '𝐕', W: '𝐖', X: '𝐗', Y: '𝐘', Z: '𝐙',
		0: '𝟎', 1: '𝟏', 2: '𝟐', 3: '𝟑', 4: '𝟒', 5: '𝟓', 6: '𝟔', 7: '𝟕', 8: '𝟖', 9: '𝟗',
		ą: '𝐚̨', ć: '𝐜́', ę: '𝐞̨', ł: 'ł', ń: '𝐧́', ó: '𝐨́', ś: '𝐬́', ź: '𝐳́', ż: '𝐳̇',
		Ą: '𝐀̨', Ć: '𝐂́', Ę: '𝐄̨', Ł: 'Ł', Ń: '𝐍́', Ó: '𝐎́', Ś: '𝐒́', Ź: '𝐙́', Ż: '𝐙̇',
	}
	return String(text || '')
		.split('')
		.map(c => chars[c] || c)
		.join('')
}

const MAIN_POST_SEO_FOOTER = `---
🌴 SALSA KATOWICE – KATO SALSA HUB 🌴
Szukasz informacji, gdzie tańczyć salsę w Katowicach i na Śląsku?
📍 Interaktywna mapa miejscówek i darmowych parkingów (Wolni Ludzie ul. Mariacka 2, Dolina Trzech Stawów, NOSPR), słownik ponad 200 figur Salsopedia oraz kubańskie radio 24/7 bez reklam czekają na naszej oficjalnej stronie:
👉 https://katosalsahub.pl/
📅 Aktualny rozkład wszystkich kursów, porównanie cenników szkół tańca (kalkulator karnetów i kart sportowych) oraz kalendarz imprez tanecznych na Śląsku:
👉 https://katosalsahub.pl/grafik.html

#SalsaKatowice #KatoSalsaHub #SalsaCubana #Katowice #TaniecKatowice #RuedaDeCasino #Timba #WolniLudzie`

export function formatMainPostBoldings(rawText) {
	if (!rawText) return ''
	let formatted = rawText
		.replace(/🎉\s*(Gdzie tańczymy w ten weekend\?[^\n]*)/g, (_, phrase) => `🎉 ${toBoldUnicode(phrase.trim())}`)
		.replace(/(Gdzie tańczymy w danym dniu[^\n:]*)/gi, (_, phrase) => toBoldUnicode(phrase))
		.replace(/^🗓️\s*(PIĄTEK|SOBOTA|NIEDZIELA)\b/gm, (_, day) => `🗓️ ${toBoldUnicode(day)}`)
	if (!formatted.includes('🌴 SALSA KATOWICE – KATO SALSA HUB 🌴')) {
		formatted = `${formatted.trimEnd()}\n\n${MAIN_POST_SEO_FOOTER}`
	}
	return formatted
}

export function getWeekNumber(d) {
	d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
	d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
	return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

export function getTitleString() {
	const today = new Date()
	if (today.getDay() === 0) {
		today.setDate(today.getDate() + 1)
	}

	const targetDate = new Date()
	targetDate.setDate(targetDate.getDate() + 1)

	const weekNum = getWeekNumber(targetDate)

	const liczebniki = [
		'zerowy', 'pierwszy', 'drugi', 'trzeci', 'czwarty', 'piąty', 'szósty', 'siódmy',
		'ósmy', 'dziewiąty', 'dziesiąty', 'jedenasty', 'dwunasty', 'trzynasty', 'czternasty', 'piętnasty',
	]

	let numerTekst = weekNum
	if (weekNum < (liczebniki.length || 0)) numerTekst = liczebniki[weekNum]

	const title = `Zestawienie imprezowe na tydzień ${numerTekst}`
	return `🎉 ${toBoldUnicode(title)}`
}

export function updateTitle() {
	const title = getTitleString()
	const titleInput = document.getElementById('post-title')
	if (titleInput) titleInput.value = title
}

export function kopiujTytul() {
	const titleVal = getTitleString()
	const hashtagi = document.getElementById('hashtagi')?.value || ''

	const extraText = `

🗓️ PIĄTEK

🗓️ SOBOTA

🗓️ NIEDZIELA


linki w komentarzu

${hashtagi}`

	navigator.clipboard.writeText(titleVal + extraText)
	alert('Szkielet zestawienia skopiowany!')
}

export function renderPollButtons(pollText) {
	const ankietaDiv = document.getElementById('kopiuj-ankiete') || document.createElement('div')
	ankietaDiv.id = 'kopiuj-ankiete'
	ankietaDiv.innerHTML = ''

	const sidebarContainer = document.getElementById('kopiuj-ankiete-container')
	if (sidebarContainer) {
		sidebarContainer.appendChild(ankietaDiv)
	} else {
		document.body.appendChild(ankietaDiv)
	}

	pollText
		.trim()
		.split('\n')
		.filter(l => l)
		.forEach(l => {
			const div = document.createElement('div')
			div.className = 'copy-line'
			const btn = document.createElement('button')
			btn.type = 'button'
			btn.textContent = '📋 ' + l

			btn.addEventListener('click', () => {
				navigator.clipboard.writeText(l)
				btn.textContent = '✅ Skopiowano!'
				btn.classList.add('clicked-poll')
				setTimeout(() => {
					btn.textContent = '✅ ' + l
				}, 1000)
			})
			div.appendChild(btn)
			ankietaDiv.appendChild(div)
		})
}

/**
 * Główna funkcja generująca treść posta, Komentarza 1 oraz przyciski ankiety
 * na podstawie formularza kalendarza (z automatycznym rozróżnianiem wydarzeń w tym samym miejscu i dniu).
 */
export function generujPost() {
	updateTitle()
	const blocks = document.querySelectorAll('.day-block')
	if (blocks.length === 0) return
	let wynik = '🎉 Zestawienie imprezowe\n\n'
	let wynikAnkieta = ''
	const dayEvents = {}

	blocks.forEach(block => {
		if (block.classList.contains('is-hidden')) return

		const containers = block.querySelectorAll('.event-block')
		const dzienTekst = block.querySelector('h3').textContent
		const activeInDay = []

		containers.forEach(eventBlock => {
			const toggleLabel = eventBlock.previousElementSibling
			const checkbox = toggleLabel ? toggleLabel.querySelector('input[type=checkbox]') : null
			if (!checkbox || !checkbox.checked) return

			const miasto = eventBlock.querySelector('.miasto')
			const miastoInne = eventBlock.querySelector('.miasto-inne')
			const miejsce = eventBlock.querySelector('.miejsce')
			const miejsceInne = eventBlock.querySelector('.miejsce-inne')
			const tytul = eventBlock.querySelector('.tytul-wydarzenia')
			const link = eventBlock.querySelector('.link')
			const container = eventBlock.parentElement
			const styleCbs = container.querySelectorAll('input.styl:checked')
			const promote = toggleLabel.querySelector('.promowane').checked

			const finalMiasto = miasto.value === 'Inne' ? miastoInne.value.trim() : miasto.value
			const finalMiejsce = miejsce.value === 'Inne' ? miejsceInne.value.trim() : miejsce.value
			const styleTekst = [...styleCbs].map(cb => cb.value).join('/')
			const shortTytul = tytul ? tytul.value.trim() : ''

			activeInDay.push({
				miasto: finalMiasto,
				miejsce: finalMiejsce,
				tytul: shortTytul,
				style: styleTekst,
				link: link.value.trim(),
				promote,
			})
		})

		dayEvents[dzienTekst] = activeInDay

		if (activeInDay.length > 0) {
			const venueCounts = new Map()
			activeInDay.forEach(ev => {
				const key = `${ev.miasto.toLowerCase()}::${ev.miejsce.toLowerCase()}`
				venueCounts.set(key, (venueCounts.get(key) || 0) + 1)
			})

			let dzienWiersz = ''
			activeInDay.forEach(ev => {
				const key = `${ev.miasto.toLowerCase()}::${ev.miejsce.toLowerCase()}`
				const count = venueCounts.get(key) || 1
				const miejsceLabel =
					count > 1 && ev.tytul && !ev.miejsce.toLowerCase().includes(ev.tytul.toLowerCase())
						? `${ev.miejsce}, ${ev.tytul}`
						: ev.miejsce

				const prefix = ev.promote ? '⭐ ' : '➡️ '
				dzienWiersz += `${prefix}${ev.miasto}: ${miejsceLabel} (${ev.style})\n`
				if (ev.link) dzienWiersz += `🔗 ${ev.link}\n`

				wynikAnkieta += `${dzienTekst}: ${ev.miasto} - ${miejsceLabel} (${ev.style})\n`
			})

			wynik += `🗓️ ${dzienTekst}:\n${dzienWiersz}\n`
		}
	})

	function budujOpisDlaDnia(events) {
		if (!events || events.length === 0) return 'Na razie brak potwierdzonych ogłoszeń.'

		const katowice = []
		const region = []
		const krakow = []

		events.forEach(e => {
			const c = (e.miasto || '').toLowerCase()
			if (c === 'katowice') katowice.push(e)
			else if (c === 'kraków' || c === 'krakow') krakow.push(e)
			else region.push(e)
		})

		const phrases = []

		if (katowice.length > 0) {
			const k = katowice[0]
			phrases.push(`w Katowicach tańczymy w ${k.miejsce} (${k.style || 'Salsa/Bachata'})`)
		}

		if (region.length > 0) {
			const r = region[0]
			if (katowice.length === 0) {
				phrases.push(`${r.miasto} zaprasza do ${r.miejsce} (${r.style})`)
			} else {
				phrases.push(`w regionie ${r.miasto} zaprasza do ${r.miejsce} (${r.style})`)
			}
			if (region.length > 1) {
				const r2 = region[1]
				phrases.push(`w ${r2.miasto} parkiet rozgrzewa ${r2.miejsce}`)
			}
		}

		if (krakow.length > 0) {
			const kr = krakow[0]
			if (katowice.length === 0 && region.length === 0) {
				phrases.push(`w Krakowie parkiet przejmuje ${kr.miejsce} (${kr.style})`)
			} else {
				phrases.push(`a w Krakowie tańczymy w ${kr.miejsce} (${kr.style})`)
			}
		}

		if (phrases.length === 0) return 'Na razie brak potwierdzonych ogłoszeń.'
		const s = phrases.join(', ') + '.'
		return s.charAt(0).toUpperCase() + s.slice(1)
	}

	const ptKey = Object.keys(dayEvents).find(k => k.includes('PIĄTEK'))
	const sbKey = Object.keys(dayEvents).find(k => k.includes('SOBOTA'))
	const ndKey = Object.keys(dayEvents).find(k => k.includes('NIEDZIELA'))

	let weekendRangeLabel = ''
	if (ptKey && ndKey) {
		const ptDateMatch = ptKey.match(/\((\d{2})\.\d{2}\)/)
		const ndDateMatch = ndKey.match(/\((\d{2}\.\d{2})\)/)
		if (ptDateMatch && ndDateMatch) {
			weekendRangeLabel = ` (${ptDateMatch[1]}-${ndDateMatch[1]})`
		}
	}

	const opisPt = budujOpisDlaDnia(dayEvents[ptKey])
	const opisSb = budujOpisDlaDnia(dayEvents[sbKey])
	const opisNd = budujOpisDlaDnia(dayEvents[ndKey])

	const gotowyPost = formatMainPostBoldings(`🎉 Gdzie tańczymy w ten weekend?${weekendRangeLabel}

🗓️ PIĄTEK
${opisPt}

🗓️ SOBOTA
${opisSb}

🗓️ NIEDZIELA
${opisNd}`)

	const postOpisElem = document.getElementById('post-opis')
	if (postOpisElem) {
		postOpisElem.value = gotowyPost
	}

	wynik += '@wszyscy Do zobaczenia na parkiecie! 💃🕺\n\n'
	wynik +=
		'☕ PS1: Podoba Ci się to, co robimy? Jeśli chcesz, możesz postawić nam wirtualną kawę – to daje nam mega kopa do dalszego działania dla Was! 👉 https://buycoffee.to/katosalsahub'

	const wynikElem = document.getElementById('wynik')
	if (wynikElem) {
		wynikElem.value = wynik
	}

	window.latestPollText = wynikAnkieta.trim()
	const ankietaEl = document.getElementById('wynik-ankieta')
	if (ankietaEl) ankietaEl.value = window.latestPollText
	renderPollButtons(wynikAnkieta)
}

const CANONICAL_COMMENT_FOOTER = `@wszyscy Do zobaczenia na parkiecie! 💃🕺

☕ PS1: Podoba Ci się to, co robimy? Jeśli chcesz, możesz postawić nam wirtualną kawę – to daje nam mega kopa do dalszego działania dla Was! 👉 https://buycoffee.to/katosalsahub`

export function ensureFullCommentFooter(rawComment) {
	if (!rawComment) return ''
	const idx = rawComment.indexOf('@wszyscy')
	if (idx !== -1) {
		return rawComment.slice(0, idx).trimEnd() + '\n\n' + CANONICAL_COMMENT_FOOTER
	}
	return rawComment.trimEnd() + '\n\n' + CANONICAL_COMMENT_FOOTER
}

export async function zaladujRaportKSH(silent = true) {
	try {
		const ts = Date.now()
		let res = await fetch('../assets/data/latest_report.md?v=' + ts).catch(() => null)
		if (!res || !res.ok) {
			res = await fetch('data/latest_report.md?v=' + ts)
		}
		if (!res || !res.ok) return
		const md = await res.text()
		if (!md) return

		window.latestFullReportMd = md
		const parts = md.split(/\r?\n---\r?\n+(?=##\s+[1-6]\.)/)
		const findSection = prefix => {
			const found = parts.find(p => p.trim().startsWith(prefix))
			if (!found) return ''
			const lines = found.trim().split('\n')
			return lines
				.slice(1)
				.map(l => l.replace(/ +$/, ''))
				.join('\n')
				.trim()
		}

		const sec1 = findSection('## 1.')
		const sec2 = findSection('## 2.')
		const sec3 = findSection('## 3.')
		const sec4 = findSection('## 4.')
		const sec5 = findSection('## 5.')
		const sec6 = findSection('## 6.')

		if (sec1) {
			const el1 = document.getElementById('audit-sec1')
			if (el1) el1.textContent = sec1
		}
		if (sec6) {
			const el6 = document.getElementById('audit-sec6')
			if (el6) el6.textContent = sec6
		}
		if (sec2) {
			const postEl = document.getElementById('post-opis')
			if (postEl) postEl.value = formatMainPostBoldings(sec2)
		}
		if (sec4) {
			const wynikEl = document.getElementById('wynik')
			if (wynikEl) wynikEl.value = ensureFullCommentFooter(sec4)
		}
		if (sec5) {
			const przyszleEl = document.getElementById('wynik-przyszle')
			if (przyszleEl) przyszleEl.value = ensureFullCommentFooter(sec5)
		}
		if (sec3) {
			window.latestPollText = sec3
			const ankietaEl = document.getElementById('wynik-ankieta')
			if (ankietaEl) ankietaEl.value = sec3
			renderPollButtons(sec3)
			const counterEl = document.getElementById('event-counter')
			if (counterEl) {
				const pollCount = sec3
					.trim()
					.split('\n')
					.filter(l => l.trim()).length
				counterEl.textContent = `Liczba wgranych wydarzeń: ${pollCount}`
			}
		}

		if (!silent) {
			alert('✅ Odświeżono bazę i raport KSH z latest_report.md!')
		}
	} catch (e) {
		console.warn('Nie udało się wczytać data/latest_report.md:', e)
		if (!silent) {
			alert('⚠️ Nie udało się wczytać raportu KSH: ' + e.message)
		}
	}
}

export function kopiujGotowyPost() {
	const postOpisElem = document.getElementById('post-opis')
	const tekst = postOpisElem ? postOpisElem.value : ''
	if (!tekst) {
		alert('Brak wygenerowanego opisu posta!')
		return
	}
	navigator.clipboard.writeText(tekst).then(() => {
		alert('✅ Skopiowano gotowy post na FB (Sekcja 2) do schowka!')
	})
}

export function kopiujWynik() {
	const text = document.getElementById('wynik')?.value || ''
	if (!text) return
	navigator.clipboard.writeText(text).then(() => {
		alert('✅ Skopiowano Komentarz 1 — Weekend (Sekcja 4) do schowka!')
	})
}

export function kopiujKomentarz2() {
	const text = document.getElementById('wynik-przyszle')?.value || ''
	if (!text) {
		alert('Brak treści Komentarza 2 (kliknij najpierw "Wczytaj Raport KSH")!')
		return
	}
	navigator.clipboard.writeText(text).then(() => {
		alert('✅ Skopiowano Komentarz 2 — Kolejne tygodnie (Sekcja 5) do schowka!')
	})
}

export function kopiujCalaAnkiete() {
	const text = window.latestPollText || ''
	if (!text) {
		alert('Brak opcji ankiety do skopiowania!')
		return
	}
	navigator.clipboard.writeText(text).then(() => {
		alert('✅ Skopiowano całą ankietę (Sekcja 3) do schowka!')
	})
}

if (typeof window !== 'undefined') {
	window.kopiujGotowyPost = kopiujGotowyPost
	window.kopiujTytul = kopiujTytul
	window.kopiujWynik = kopiujWynik
	window.kopiujKomentarz2 = kopiujKomentarz2
	window.kopiujCalaAnkiete = kopiujCalaAnkiete
	window.generujPost = generujPost
}
