import {
	LICZBA_DNI,
	miejscaWgMiasta,
	style,
	dniTygodnia,
	FB_QUICK_LINKS,
} from './config.js?v=20261023_v2'
import { formatujDatePL, generujDniOdJutra } from './utils.js?v=20261023_v2'
import { initWeather } from './weather.js?v=20261023_v2'
import { importujZFacebooka } from './parser.js?v=20261023_v2'
import {
	initInbox,
	updateTitle,
	kopiujTytul,
	generujPost,
	zaladujRaportKSH,
	kopiujGotowyPost,
	kopiujWynik,
	kopiujKomentarz2,
	kopiujCalaAnkiete,
} from './post-generator.js?v=20261023_v2'

function getDragAfterElement(container, y) {
	const draggableElements = [...container.querySelectorAll('.event-container:not(.dragging)')]

	return draggableElements.reduce(
		(closest, child) => {
			const box = child.getBoundingClientRect()
			const offset = y - box.top - box.height / 2
			if (offset < 0 && offset > closest.offset) {
				return { offset: offset, element: child }
			} else {
				return closest
			}
		},
		{ offset: Number.NEGATIVE_INFINITY },
	).element
}

function createEventContainer(block, index, onCountChange) {
	const container = document.createElement('div')
	container.className = 'event-container'
	container.draggable = true

	container.addEventListener('dragstart', () => {
		container.classList.add('dragging')
	})

	container.addEventListener('dragend', () => {
		container.classList.remove('dragging')
		generujPost()
	})

	const checkbox = document.createElement('input')
	checkbox.type = 'checkbox'
	checkbox.className = 'toggle-checkbox'

	const promoteInput = document.createElement('input')
	promoteInput.type = 'checkbox'
	promoteInput.className = 'promowane'
	const promoteLabel = document.createElement('label')
	promoteLabel.className = 'promote-label is-hidden'
	promoteLabel.appendChild(promoteInput)
	promoteLabel.append(' Promuj ⭐')

	promoteLabel.addEventListener('click', function (e) {
		e.stopPropagation()
	})

	const toggle = document.createElement('label')
	toggle.className = 'event-header'

	const headerContent = document.createElement('div')
	headerContent.className = 'event-header-content'

	const labelText = document.createElement('span')
	labelText.className = 'event-pos-label'
	labelText.textContent = ` Pozycja ${index + 1} `

	toggle.appendChild(checkbox)
	headerContent.appendChild(labelText)
	headerContent.appendChild(promoteLabel)
	toggle.appendChild(headerContent)

	const eventBlock = document.createElement('div')
	eventBlock.className = 'event-block is-hidden'

	const selectMiasto = document.createElement('select')
	selectMiasto.className = 'miasto'
	selectMiasto.innerHTML =
		Object.keys(miejscaWgMiasta)
			.map(m => `<option value="${m}">${m}</option>`)
			.join('') + '<option value="Inne">Inne</option>'

	const inputMiastoInne = document.createElement('input')
	inputMiastoInne.type = 'text'
	inputMiastoInne.className = 'miasto-inne is-hidden'
	inputMiastoInne.placeholder = 'Wpisz miasto'

	const selectMiejsce = document.createElement('select')
	selectMiejsce.className = 'miejsce'

	const inputMiejsceInne = document.createElement('input')
	inputMiejsceInne.type = 'text'
	inputMiejsceInne.className = 'miejsce-inne is-hidden'
	inputMiejsceInne.placeholder = 'Wpisz miejsce'

	const inputTytul = document.createElement('input')
	inputTytul.type = 'text'
	inputTytul.className = 'tytul-wydarzenia'
	inputTytul.placeholder = 'Krótka nazwa imprezy/warsztatów (opcjonalnie)'

	const inputLink = document.createElement('input')
	inputLink.type = 'text'
	inputLink.className = 'link'
	inputLink.placeholder = 'Link'

	const styleBox = document.createElement('div')
	styleBox.className = 'checkboxes is-hidden'

	const primaryStyles = style.slice(0, 3)
	const secondaryStyles = style.slice(3)

	const primaryHtml = primaryStyles
		.map(s => `<label><input type="checkbox" class="styl" value="${s}"> ${s}</label>`)
		.join('')

	styleBox.innerHTML = primaryHtml
	styleBox.addEventListener('click', e => e.stopPropagation())

	if (secondaryStyles.length > 0) {
		const details = document.createElement('details')
		details.className = 'style-details'

		const summary = document.createElement('summary')
		summary.textContent = '▸'
		details.appendChild(summary)

		const secondaryContainer = document.createElement('div')
		secondaryContainer.className = 'style-secondary-container'
		secondaryContainer.innerHTML = secondaryStyles
			.map(s => `<label><input type="checkbox" class="styl" value="${s}"> ${s}</label>`)
			.join('')

		details.appendChild(secondaryContainer)
		styleBox.appendChild(details)
		details.addEventListener('click', e => e.stopPropagation())
	}

	headerContent.appendChild(styleBox)

	function updateMiejscaOptions(miasto) {
		if (miasto === 'Inne') {
			selectMiejsce.classList.add('is-hidden')
			inputMiejsceInne.classList.remove('is-hidden')
			inputMiastoInne.classList.remove('is-hidden')
		} else {
			selectMiejsce.classList.remove('is-hidden')
			inputMiejsceInne.classList.add('is-hidden')
			inputMiastoInne.classList.add('is-hidden')
			selectMiejsce.innerHTML =
				(miejscaWgMiasta[miasto] || []).map(m => `<option value="${m}">${m}</option>`).join('') +
				'<option value="Inne">Inne</option>'
		}
	}

	selectMiasto.addEventListener('change', function () {
		updateMiejscaOptions(this.value)
		generujPost()
	})
	selectMiejsce.addEventListener('change', function () {
		inputMiejsceInne.classList.toggle('is-hidden', this.value !== 'Inne')
		generujPost()
	})
	checkbox.addEventListener('change', function () {
		eventBlock.classList.toggle('is-hidden', !this.checked)
		promoteLabel.classList.toggle('is-hidden', !this.checked)
		styleBox.classList.toggle('is-hidden', !this.checked)
		if (typeof onCountChange === 'function') onCountChange()

		if (this.checked) {
			const allContainers = Array.from(block.querySelectorAll('.event-container'))
			const isLastEvent = container === allContainers[allContainers.length - 1]
			const allPreviousChecked = allContainers.slice(0, -1).every(c => {
				const cb = c.querySelector('.toggle-checkbox')
				return cb && cb.checked
			})

			if (isLastEvent && allPreviousChecked) {
				const newIndex = allContainers.length
				const newContainer = createEventContainer(block, newIndex, onCountChange)
				block.appendChild(newContainer)
			}
		}

		generujPost()
	})

	inputTytul.addEventListener('input', generujPost)
	inputLink.addEventListener('input', generujPost)
	inputMiastoInne.addEventListener('input', generujPost)
	inputMiejsceInne.addEventListener('input', generujPost)

	styleBox.querySelectorAll('input.styl').forEach(cb => {
		cb.addEventListener('change', generujPost)
	})

	promoteInput.addEventListener('change', generujPost)
	updateMiejscaOptions(selectMiasto.value)

	eventBlock.append(selectMiasto, inputMiastoInne, selectMiejsce, inputMiejsceInne, inputTytul, inputLink)
	container.append(toggle, eventBlock)

	return container
}

document.addEventListener('DOMContentLoaded', function () {
	console.log('[DancePuls] Inicjalizacja wersji 20261020...')

	const dni = generujDniOdJutra(LICZBA_DNI, dniTygodnia)
	const form = document.getElementById('form')

	function updateEventCounter() {
		const count = document.querySelectorAll('.event-container .toggle-checkbox:checked').length
		const counterEl = document.getElementById('event-counter')
		if (!counterEl) return
		if (count > 0) {
			counterEl.textContent = `Liczba wgranych wydarzeń: ${count}`
		} else if (window.latestPollText) {
			const pollCount = window.latestPollText
				.trim()
				.split('\n')
				.filter(l => l.trim()).length
			counterEl.textContent = `Liczba wgranych wydarzeń: ${pollCount}`
		}
	}

	function buildDayBlock(dzienObj) {
		const block = document.createElement('div')
		block.className = 'day-block'
		block.dataset.date = dzienObj.ymd
		block.dataset.dzienTygIndex = dzienObj.dzienTygIndex
		block.innerHTML = `<h3>${dzienObj.label}</h3>`

		block.addEventListener('dragover', e => {
			e.preventDefault()
			const afterElement = getDragAfterElement(block, e.clientY)
			const draggable = document.querySelector('.dragging')
			if (draggable && block.contains(draggable)) {
				if (afterElement == null) {
					block.appendChild(draggable)
				} else {
					block.insertBefore(draggable, afterElement)
				}
			}
		})

		block._createEventContainer = (blk, idx) => createEventContainer(blk, idx, updateEventCounter)

		for (let i = 0; i < 1; i++) {
			const container = block._createEventContainer(block, i)
			block.appendChild(container)
		}
		return block
	}

	function ensureDayBlock(ymdStr) {
		if (!form) return null
		const existing = Array.from(form.querySelectorAll('.day-block')).find(b => b.dataset.date === ymdStr)
		if (existing) return existing

		const parts = String(ymdStr || '').split('-')
		if (parts.length !== 3) return null
		const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
		if (Number.isNaN(d.getTime())) return null

		const dzienTyg = dniTygodnia[d.getDay()]
		const yearSuffix = d.getFullYear() !== new Date().getFullYear() ? `.${d.getFullYear()}` : ''
		const newObj = {
			date: d,
			ymd: ymdStr,
			label: `${dzienTyg} (${formatujDatePL(d)}${yearSuffix})`,
			dzienTygIndex: d.getDay(),
		}
		const newBlock = buildDayBlock(newObj)
		const allBlocks = Array.from(form.querySelectorAll('.day-block'))
		const insertBeforeBlock = allBlocks.find(b => b.dataset.date > ymdStr)
		if (insertBeforeBlock) {
			form.insertBefore(newBlock, insertBeforeBlock)
		} else {
			form.appendChild(newBlock)
		}
		return newBlock
	}

	if (form) {
		dni.forEach(dzienObj => {
			form.appendChild(buildDayBlock(dzienObj))
		})
		generujPost()
	}

	const filterSelect = document.getElementById('filter-select')
	if (filterSelect) {
		filterSelect.addEventListener('change', applyFilter)
	}

	function applyFilter() {
		if (!filterSelect) return
		const value = filterSelect.value
		const blocks = document.querySelectorAll('.day-block')

		if (value === 'all') {
			blocks.forEach(block => {
				block.classList.remove('is-hidden')
			})
			return
		}

		if (value === 'thisweek') {
			const today = new Date()
			today.setHours(0, 0, 0, 0)

			const dayOfWeek = today.getDay()
			const daysUntilSunday = (7 - dayOfWeek) % 7

			const thisSunday = new Date(today)
			thisSunday.setDate(today.getDate() + daysUntilSunday)
			thisSunday.setHours(23, 59, 59, 999)

			blocks.forEach(block => {
				const blockDate = new Date(block.dataset.date)
				block.classList.toggle('is-hidden', blockDate > thisSunday)
			})
			return
		}

		if (value === 'weekend') {
			let firstFridayIndex = null
			let fridayCount = 0

			dni.forEach((d, i) => {
				if (d.dzienTygIndex === 5) {
					fridayCount++
					if (fridayCount === 1) firstFridayIndex = i
				}
			})

			blocks.forEach((block, index) => {
				let show = false
				if (firstFridayIndex !== null) {
					show = [firstFridayIndex, firstFridayIndex + 1, firstFridayIndex + 2].includes(index)
				}
				block.classList.toggle('is-hidden', !show)
			})
		}
	}

	const btnReset = document.getElementById('reset-history-btn')
	if (btnReset) {
		btnReset.addEventListener('click', () => {
			if (confirm('Na pewno zresetować historię wszystkich zgłoszeń? (Usunie checkbox "Zatwierdź" w Inboxie)')) {
				localStorage.removeItem('party_inbox_done')
				location.reload()
			}
		})
	}

	const btnClearForm = document.getElementById('clear-form-btn')
	if (btnClearForm) {
		btnClearForm.addEventListener('click', () => {
			if (confirm('Na pewno wyczyścić cały formularz i przywrócić stan początkowy?')) {
				localStorage.removeItem('party_generator_stan')
				location.reload()
			}
		})
	}

	const btnCopyScraper = document.getElementById('copy-scraper-btn')
	if (btnCopyScraper) {
		btnCopyScraper.addEventListener('click', () => {
			fetch('tools/fb_scraper.js?v=' + new Date().getTime())
				.then(r => r.text())
				.then(t => {
					window.scraperScriptCache = t
					navigator.clipboard.writeText(t).then(() => alert('Nowy skrypt (JSON-LD) skopiowany!'))
				})
		})
	}

	const btnOpenFB = document.getElementById('open-fb-links-btn')
	if (btnOpenFB) {
		btnOpenFB.addEventListener('click', () => {
			if (
				confirm(
					`Czy otworzyć ${FB_QUICK_LINKS.length} zakładek FB w nowych oknach? (Może być wymagana zgoda na pop-upy)`,
				)
			) {
				FB_QUICK_LINKS.forEach(url => {
					window.open(url, '_blank')
				})
			}
		})
	}

	const btnOpenKSH = document.getElementById('open-ksh-btn')
	if (btnOpenKSH) {
		btnOpenKSH.addEventListener('click', () => {
			window.open('https://www.facebook.com/groups/519446499987373', '_blank')
		})
	}

	const btnImport = document.getElementById('import-btn')
	if (btnImport) {
		btnImport.addEventListener('click', () => {
			importujZFacebooka(false, { ensureDayBlock, zapiszStan, generujPost })
		})
	}

	const btnCopyPost = document.getElementById('copy-post-btn')
	if (btnCopyPost) btnCopyPost.addEventListener('click', kopiujGotowyPost)

	const btnCopySkeleton = document.getElementById('copy-skeleton-btn')
	if (btnCopySkeleton) btnCopySkeleton.addEventListener('click', kopiujTytul)

	const btnCopyComment1 = document.getElementById('copy-comment1-btn')
	if (btnCopyComment1) btnCopyComment1.addEventListener('click', kopiujWynik)

	const btnCopyComment2 = document.getElementById('copy-comment2-btn')
	if (btnCopyComment2) btnCopyComment2.addEventListener('click', kopiujKomentarz2)

	const btnCopyAllPoll = document.getElementById('copy-all-poll-btn')
	if (btnCopyAllPoll) btnCopyAllPoll.addEventListener('click', kopiujCalaAnkiete)

	applyFilter()

	function zapiszStan() {
		const stan = []
		const blocks = document.querySelectorAll('.day-block')

		blocks.forEach(block => {
			const dataData = block.dataset.date
			const events = []

			block.querySelectorAll('.event-container').forEach(container => {
				const checkbox = container.querySelector('.toggle-checkbox')
				if (!checkbox.checked) return

				const isChecked = checkbox.checked
				const promote = container.querySelector('.promowane').checked
				const eventBlock = container.querySelector('.event-block')

				const miasto = eventBlock.querySelector('.miasto')?.value || ''
				const miastoInne = eventBlock.querySelector('.miasto-inne')?.value || ''
				const miejsce = eventBlock.querySelector('.miejsce')?.value || ''
				const miejsceInne = eventBlock.querySelector('.miejsce-inne')?.value || ''
				const tytul = eventBlock.querySelector('.tytul-wydarzenia')?.value || ''
				const link = eventBlock.querySelector('.link')?.value || ''

				const styleActive = Array.from(container.querySelectorAll('input.styl:checked')).map(cb => cb.value)

				if (isChecked || link || miasto !== 'Katowice') {
					events.push({
						checked: isChecked,
						promote: promote,
						miasto,
						miastoInne,
						miejsce,
						miejsceInne,
						tytul,
						link,
						style: styleActive,
					})
				}
			})

			if (events.length > 0) {
				stan.push({ date: dataData, events })
			}
		})

		localStorage.setItem('party_generator_stan', JSON.stringify(stan))
		generujPost()
	}

	function wczytajStan(customStan = null) {
		const saved = customStan ? JSON.stringify(customStan) : localStorage.getItem('party_generator_stan')
		if (!saved) return

		try {
			const stan = JSON.parse(saved)

			stan.forEach(dayData => {
				const targetBlock = ensureDayBlock(dayData.date)
				if (!targetBlock) return

				if (targetBlock._createEventContainer && dayData.events) {
					while (targetBlock.querySelectorAll('.event-container').length < dayData.events.length) {
						const newIdx = targetBlock.querySelectorAll('.event-container').length
						targetBlock.appendChild(targetBlock._createEventContainer(targetBlock, newIdx))
					}
				}

				const containers = targetBlock.querySelectorAll('.event-container')

				dayData.events.forEach((ev, index) => {
					if (index >= containers.length) return

					const container = containers[index]
					const eventBlock = container.querySelector('.event-block')

					const checkbox = container.querySelector('.toggle-checkbox')
					checkbox.checked = ev.checked

					const promote = container.querySelector('.promowane')
					promote.checked = Boolean(ev.promote)
					promote.parentElement.classList.toggle('is-hidden', !ev.checked)
					container.querySelector('.checkboxes').classList.toggle('is-hidden', !ev.checked)
					eventBlock.classList.toggle('is-hidden', !ev.checked)

					const miastoSelect = eventBlock.querySelector('.miasto')
					const miastoInne = eventBlock.querySelector('.miasto-inne')
					const miejsceSelect = eventBlock.querySelector('.miejsce')
					const miejsceInne = eventBlock.querySelector('.miejsce-inne')
					const tytulInput = eventBlock.querySelector('.tytul-wydarzenia')
					const linkInput = eventBlock.querySelector('.link')

					const city = ev.miasto || 'Katowice'
					const place = ev.miejsce || ''

					if (miejscaWgMiasta[city]) {
						miastoSelect.value = city
						miastoInne.classList.add('is-hidden')
						miastoInne.value = ''
					} else {
						miastoSelect.value = 'Inne'
						miastoInne.classList.remove('is-hidden')
						miastoInne.value = city || ev.miastoInne || ''
					}
					miastoSelect.dispatchEvent(new Event('change'))

					const knownPlaces = miejscaWgMiasta[city] || []
					if (knownPlaces.includes(place)) {
						miejsceSelect.value = place
						miejsceInne.classList.add('is-hidden')
						miejsceInne.value = ''
					} else {
						miejsceSelect.value = 'Inne'
						miejsceInne.classList.remove('is-hidden')
						miejsceInne.value = place || ev.miejsceInne || ''
					}
					miejsceSelect.dispatchEvent(new Event('change'))

					if (tytulInput) {
						const fallbackTitle = ev.opis ? ev.opis.split(' - ')[0].split(',')[0].trim() : ''
						tytulInput.value = ev.tytul || fallbackTitle || ''
					}

					if (linkInput) {
						linkInput.value = ev.link || ''
					}

					const styleCbs = container.querySelectorAll('input.styl')
					const eventStyles = Array.isArray(ev.style) ? ev.style : ev.styles ? ev.styles.split(/[\/,]/) : []
					const lowerStyles = eventStyles.map(s => s.trim().toLowerCase())
					styleCbs.forEach(cb => {
						const cbVal = cb.value.toLowerCase()
						cb.checked = lowerStyles.some(s => s === cbVal || cbVal.includes(s) || s.includes(cbVal))
					})
				})
			})

			generujPost()
			updateEventCounter()
		} catch (e) {
			console.error('Błąd wczytywania stanu:', e)
		}
	}

	async function zaladujZPlikuJSON() {
		try {
			const ts = Date.now()
			let res = await fetch('../assets/data/events.json?v=' + ts).catch(() => null)
			if (!res || !res.ok) {
				res = await fetch('data/events.json?v=' + ts)
			}
			if (!res || !res.ok) return
			const data = await res.json()
			if (Array.isArray(data) && data.length > 0) {
				wczytajStan(data)
				zapiszStan()
				console.log('✅ Pomyślnie załadowano bazę z events.json (' + data.length + ' dni)')
			}
		} catch (e) {
			console.warn('Nie udało się załadować events.json:', e)
		}
	}

	const btnLoadDb = document.getElementById('load-db-btn')
	if (btnLoadDb) {
		btnLoadDb.addEventListener('click', async () => {
			if (confirm('Czy chcesz wczytać aktualne wydarzenia z pliku data/events.json? Nadpisze to obecny formularz.')) {
				await zaladujZPlikuJSON()
				await zaladujRaportKSH(true)
				alert('✅ Pomyślnie wczytano wydarzenia z bazy i zaktualizowano raport!')
			}
		})
	}

	const btnLoadReport = document.getElementById('load-report-btn')
	if (btnLoadReport) {
		btnLoadReport.addEventListener('click', async () => {
			const originalLabel = btnLoadReport.textContent
			btnLoadReport.disabled = true
			btnLoadReport.textContent = '⏳ Odświeżanie zestawienia...'
			try {
				try {
					const scraperRes = await fetch('tools/fb_scraper.js?v=' + Date.now())
					if (scraperRes.ok) {
						const scriptText = await scraperRes.text()
						window.scraperScriptCache = scriptText
						await navigator.clipboard.writeText(scriptText).catch(() => null)
					}
				} catch {
					/* ignore clipboard error */
				}

				await fetch('/dancepuls/api/run-scrapers', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
				}).catch(() => null)

				await zaladujZPlikuJSON()
				await zaladujRaportKSH(false)
			} catch (err) {
				console.error('Błąd odświeżania zestawienia:', err)
				alert('⚠️ Wystąpił problem podczas odświeżania: ' + err.message)
			} finally {
				btnLoadReport.disabled = false
				btnLoadReport.textContent = originalLabel
			}
		})
	}

	function nasluchujZmian() {
		const formContainer = document.getElementById('form')
		if (formContainer) {
			formContainer.addEventListener('input', () => {
				zapiszStan()
			})

			formContainer.addEventListener('change', () => {
				zapiszStan()
			})
		}

		const hashInput = document.getElementById('hashtagi')
		if (hashInput) {
			hashInput.addEventListener('input', zapiszStan)
		}
	}

	nasluchujZmian()
	zaladujRaportKSH(true)
	if (form) {
		zaladujZPlikuJSON().then(() => {
			generujPost()
			zaladujRaportKSH(true)
		})
	}

	window.scraperScriptCache = ''
	fetch('tools/fb_scraper.js')
		.then(r => r.text())
		.then(text => {
			window.scraperScriptCache = text
			console.log('Scraper script cached (' + text.length + ' bytes)')
		})
		.catch(console.error)

	window.addEventListener('focus', () => {
		setTimeout(() => {
			importujZFacebooka(true, { ensureDayBlock, zapiszStan, generujPost })
		}, 500)
	})

	function setupModal(modalId, openBtnId, closeBtnId) {
		const modalEl = document.getElementById(modalId)
		const openBtn = document.getElementById(openBtnId)
		const closeBtn = document.getElementById(closeBtnId)
		if (!modalEl) return

		const closeModal = () => {
			modalEl.classList.remove('open')
		}

		if (openBtn) {
			openBtn.addEventListener('click', () => {
				if (modalEl.classList.contains('open')) {
					closeModal()
				} else {
					modalEl.classList.add('open')
				}
			})
		}

		if (closeBtn) {
			closeBtn.addEventListener('click', closeModal)
		}

		window.addEventListener('click', event => {
			if (event.target === modalEl) {
				closeModal()
			}
		})
	}

	setupModal('help-modal', 'help-btn', 'close-help-modal')
	setupModal('audit-modal', 'open-audit-btn', 'close-audit-modal')

	const btnCopyFullReport = document.getElementById('copy-full-report-btn')
	if (btnCopyFullReport) {
		btnCopyFullReport.addEventListener('click', () => {
			if (!window.latestFullReportMd) {
				alert('Brak wczytanego raportu KSH!')
				return
			}
			navigator.clipboard.writeText(window.latestFullReportMd).then(() => {
				alert('✅ Skopiowano pełny 6-sekcyjny raport KSH (Markdown) do schowka!')
			})
		})
	}

	function isMobile() {
		return (
			/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
			window.innerWidth <= 800
		)
	}

	const mobileModal = document.getElementById('mobile-warning-modal')
	const mobileCloseBtn = document.getElementById('mobile-warning-close')
	const forceMobile = new URLSearchParams(window.location.search).has('mobile')

	if ((isMobile() || forceMobile) && (!sessionStorage.getItem('mobile_warning_dismissed') || forceMobile)) {
		if (mobileModal) {
			mobileModal.classList.add('open')
		}
	}

	if (mobileCloseBtn) {
		mobileCloseBtn.addEventListener('click', () => {
			if (mobileModal) mobileModal.classList.remove('open')
			sessionStorage.setItem('mobile_warning_dismissed', 'true')
		})
	}

	updateEventCounter()
	updateTitle()
	initInbox()
	initWeather('weather-widget')
})
