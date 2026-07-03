import {
	LICZBA_DNI,
	miejscaWgMiasta,
	style,
	dniTygodnia,
	adresyMap,
	adresMiastoSztywne,
	styleKeywords,
	FB_QUICK_LINKS,
} from './config.js?v=20260205_v17'
import { parsujDateFB, formatujDatePL, toYMD, dodajDni, generujDniOdJutra } from './utils.js?v=20260205_v17'
import { initWeather } from './weather.js?v=20260205_v17'
import { parseClipboardData } from './parser.js?v=20260205_v17'

document.addEventListener('DOMContentLoaded', function () {
	console.log('[DancePuls] Inicjalizacja wersji 20260205...')
	// LICZBA_DNI, miejscaWgMiasta, style, dniTygodnia imported from config.js

	// Helpers imported

	const dni = generujDniOdJutra(LICZBA_DNI, dniTygodnia)
	const form = document.getElementById('form')

	// Generowanie pól formularza
	// Helper for DnD
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

	// Generowanie pól formularza
	dni.forEach(dzienObj => {
		const block = document.createElement('div')
		block.className = 'day-block'
		block.dataset.date = dzienObj.ymd
		block.dataset.dzienTygIndex = dzienObj.dzienTygIndex
		block.innerHTML = `<h3>${dzienObj.label}</h3>`

		// Drag Over for determining order
		block.addEventListener('dragover', e => {
			e.preventDefault()
			const afterElement = getDragAfterElement(block, e.clientY)
			const draggable = document.querySelector('.dragging')
			// Ensure we are dropping inside the correct day block (simple check: is draggable child of this block?)
			// Actually, we might want to allow moving between days? User said "miedzy soba", implies reordering. Moving between days might be complex (changing dates?).
			// Let's restrict to same day for now to avoid logic mess.
			if (draggable && block.contains(draggable)) {
				if (afterElement == null) {
					block.appendChild(draggable)
				} else {
					block.insertBefore(draggable, afterElement)
				}
			}
		})

		// Funkcja tworząca kontener wydarzenia (używana przy inicjalizacji i dynamicznym dodawaniu)
		function createEventContainer(block, index) {
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
			promoteLabel.style.cursor = 'pointer'
			promoteLabel.style.marginLeft = '10px'
			promoteLabel.style.marginRight = '5px'
			promoteLabel.style.display = 'none'
			promoteLabel.appendChild(promoteInput)
			promoteLabel.append(' Promuj ⭐')

			promoteLabel.addEventListener('click', function (e) {
				e.stopPropagation()
			})

			const toggle = document.createElement('label')
			toggle.style.display = 'flex'
			toggle.style.alignItems = 'center'
			toggle.style.cursor = 'pointer'
			toggle.style.flex = '1'

			const headerContent = document.createElement('div')
			headerContent.className = 'event-header-content'
			headerContent.style.display = 'flex'
			headerContent.style.alignItems = 'center'
			headerContent.style.flex = '1'

			const labelText = document.createElement('span')
			labelText.textContent = ` Pozycja ${index + 1} `
			labelText.style.marginRight = '5px'

			toggle.appendChild(checkbox)
			headerContent.appendChild(labelText)
			headerContent.appendChild(promoteLabel)
			toggle.appendChild(headerContent)

			const eventBlock = document.createElement('div')
			eventBlock.className = 'event-block'
			eventBlock.style.display = 'none'

			const selectMiasto = document.createElement('select')
			selectMiasto.className = 'miasto'
			selectMiasto.innerHTML =
				Object.keys(miejscaWgMiasta)
					.map(m => `<option value="${m}">${m}</option>`)
					.join('') + '<option value="Inne">Inne</option>'

			const inputMiastoInne = document.createElement('input')
			inputMiastoInne.className = 'miasto-inne'
			inputMiastoInne.placeholder = 'Wpisz miasto'
			inputMiastoInne.style.display = 'none'

			const selectMiejsce = document.createElement('select')
			selectMiejsce.className = 'miejsce'

			const inputMiejsceInne = document.createElement('input')
			inputMiejsceInne.className = 'miejsce-inne'
			inputMiejsceInne.placeholder = 'Wpisz miejsce'
			inputMiejsceInne.style.display = 'none'

			const inputLink = document.createElement('input')
			inputLink.type = 'text'
			inputLink.className = 'link'
			inputLink.placeholder = 'Link'

			const styleBox = document.createElement('div')
			styleBox.className = 'checkboxes'

			// Pokaż pierwsze 3 style (Cubana, Salsa, Bachata)
			const primaryStyles = style.slice(0, 3)
			const secondaryStyles = style.slice(3)

			const primaryHtml = primaryStyles
				.map(s => `<label><input type="checkbox" class="styl" value="${s}"> ${s}</label>`)
				.join('')

			styleBox.innerHTML = primaryHtml

			// Powstrzymaj propagację kliknięcia w style, żeby nie zwijać eventu
			styleBox.addEventListener('click', e => e.stopPropagation())

			if (secondaryStyles.length > 0) {
				const details = document.createElement('details')
				details.className = 'style-details'
				details.style.display = 'inline-block'
				details.style.verticalAlign = 'middle'
				details.style.marginLeft = '10px'
				details.style.position = 'relative'

				const summary = document.createElement('summary')
				summary.textContent = '▸'
				summary.style.cursor = 'pointer'
				summary.style.fontSize = '1.2em'
				summary.style.userSelect = 'none'
				summary.style.listStyle = 'none'
				summary.style.color = 'black'

				details.appendChild(summary)

				const secondaryContainer = document.createElement('div')
				secondaryContainer.className = 'style-secondary-container'
				secondaryContainer.style.marginTop = '5px'
				secondaryContainer.style.display = 'flex'
				secondaryContainer.style.flexWrap = 'wrap'
				secondaryContainer.style.gap = '10px'
				secondaryContainer.style.position = 'absolute'
				secondaryContainer.style.top = '100%'
				secondaryContainer.style.right = '0'
				secondaryContainer.style.zIndex = '100'
				secondaryContainer.style.background = 'white'
				secondaryContainer.style.border = '1px solid #ccc'
				secondaryContainer.style.padding = '10px'
				secondaryContainer.style.borderRadius = '5px'
				secondaryContainer.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)'
				secondaryContainer.style.minWidth = '200px'

				secondaryContainer.innerHTML = secondaryStyles
					.map(s => `<label><input type="checkbox" class="styl" value="${s}"> ${s}</label>`)
					.join('')

				details.appendChild(secondaryContainer)
				styleBox.appendChild(details)

				// Powstrzymaj propagację kliknięcia w detale stylów, żeby nie zwijać eventu
				details.addEventListener('click', e => e.stopPropagation())
			}

			styleBox.style.display = 'none'
			headerContent.appendChild(styleBox)

			function updateMiejscaOptions(miasto) {
				if (miasto === 'Inne') {
					selectMiejsce.style.display = 'none'
					inputMiejsceInne.style.display = 'block'
					inputMiastoInne.style.display = 'block'
				} else {
					selectMiejsce.style.display = 'block'
					inputMiejsceInne.style.display = 'none'
					inputMiastoInne.style.display = 'none'
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
				inputMiejsceInne.style.display = this.value === 'Inne' ? 'block' : 'none'
				generujPost()
			})
			checkbox.addEventListener('change', function () {
				eventBlock.style.display = this.checked ? 'block' : 'none'
				promoteLabel.style.display = this.checked ? 'inline-block' : 'none'
				styleBox.style.display = this.checked ? 'flex' : 'none'
				if (typeof updateEventCounter === 'function') updateEventCounter()

				// Automatyczne dodawanie nowego wydarzenia
				if (this.checked) {
					const allContainers = Array.from(block.querySelectorAll('.event-container'))

					// Sprawdź, czy to ostatnie pole i czy wszystkie poprzednie są zaznaczone
					const isLastEvent = container === allContainers[allContainers.length - 1]
					const allPreviousChecked = allContainers.slice(0, -1).every(c => {
						const cb = c.querySelector('.toggle-checkbox')
						return cb && cb.checked
					})

					// Dodaj nowe pole tylko jeśli to ostatnie i wszystkie poprzednie są zaznaczone
					if (isLastEvent && allPreviousChecked) {
						const newIndex = allContainers.length
						const newContainer = createEventContainer(block, newIndex)
						block.appendChild(newContainer)
					}
				}

				generujPost()
			})

			// Dodaj event listenery do inputów
			inputLink.addEventListener('input', generujPost)
			inputMiastoInne.addEventListener('input', generujPost)
			inputMiejsceInne.addEventListener('input', generujPost)

			// Dodaj event listenery do checkboxów stylów
			styleBox.querySelectorAll('input.styl').forEach(cb => {
				cb.addEventListener('change', generujPost)
			})

			// Dodaj event listener do promote checkbox
			promoteInput.addEventListener('change', generujPost)

			updateMiejscaOptions(selectMiasto.value)

			eventBlock.append(selectMiasto, inputMiastoInne, selectMiejsce, inputMiejsceInne, inputLink)
			container.append(toggle, eventBlock)

			// Styl dla headera, żeby checkbox był w linii z resztą
			toggle.classList.add('event-header')

			return container
		}

		// Generuj 1 domyślne wydarzenie (kolejne dodają się dynamicznie)
		for (let i = 0; i < 1; i++) {
			const container = createEventContainer(block, i)
			block.appendChild(container)
		}
		form.appendChild(block)
	})

	// Wygeneruj początkowy post
	generujPost()

	// Filtrowanie
	const filterSelect = document.getElementById('filter-select')
	filterSelect.addEventListener('change', applyFilter)

	function applyFilter() {
		const value = filterSelect.value
		const blocks = document.querySelectorAll('.day-block')

		if (value === 'all') {
			blocks.forEach(block => {
				block.style.display = 'block'
			})
			return
		}

		if (value === 'thisweek') {
			const today = new Date()
			today.setHours(0, 0, 0, 0)

			// Calculate upcoming Sunday
			const dayOfWeek = today.getDay() // 0-Sun, ... 6-Sat
			const daysUntilSunday = (7 - dayOfWeek) % 7

			const thisSunday = new Date(today)
			thisSunday.setDate(today.getDate() + daysUntilSunday)
			thisSunday.setHours(23, 59, 59, 999)

			blocks.forEach(block => {
				const blockDate = new Date(block.dataset.date)
				// Show if it falls within this week (up to Sunday)
				block.style.display = blockDate <= thisSunday ? 'block' : 'none'
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
				block.style.display = show ? 'block' : 'none'
			})
		}
	}

	// Buttons
	// document.getElementById('generuj-btn').addEventListener('click', generujPost) // USUWAMY

	// NEW BUTTONS LISTENERS
	const btnReset = document.getElementById('reset-history-btn')
	if (btnReset) {
		btnReset.addEventListener('click', () => {
			if (confirm('Na pewno zresetować historię wszystkich zgłoszeń? (Usunie checkbox "Zatwierdź" w Inboxie)')) {
				localStorage.removeItem('party_inbox_done')
				location.reload()
			}
		})
	}

	const btnClear = document.getElementById('clear-import-btn')
	if (btnClear) {
		btnClear.addEventListener('click', () => {
			document.getElementById('import-fb-data').value = ''
			// Optional: maybe clear form events? No, logic says "Clear Field".
			// If user meant "Clear Form", that is "wyczysc formularz" which was already in header?
			// User said "reset historii zgloszen i wyczysc skrypt".
			// "Wyczysc skrypt" probably means the JSON field.
		})
	}

	const btnCopyScraper = document.getElementById('copy-scraper-btn')
	if (btnCopyScraper) {
		btnCopyScraper.addEventListener('click', () => {
			// ALWAYS FETCH NEW to avoid stale cache issues when I update the file
			// window.scraperScriptCache check REMOVED
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
			importujZFacebooka(false) // Manualny: nie cichy!
		})
	}

	applyFilter()

	// --- AUTOSAVE & LIVE PREVIEW ---

	/**
	 * Serializuje bieżący stan formularza i zapisuje go w localStorage.
	 * Automatycznie wywołuje generowanie posta.
	 */
	function zapiszStan() {
		const stan = []
		const blocks = document.querySelectorAll('.day-block')

		blocks.forEach(block => {
			const dataData = block.dataset.date
			const events = []

			block.querySelectorAll('.event-container').forEach(container => {
				const checkbox = container.querySelector('.toggle-checkbox')
				if (!checkbox.checked) return // Zapisujemy tylko aktywne, żeby nie śmiecić? A może wszystkie?
				// Zapiszmy tylko te 'checked', żeby przy restore tylko one się otworzyły.
				// Ale jak user wpisał coś i odznaczył, to straci?
				// Lepiej zapisać stan 'checked' w obiekcie.

				const isChecked = checkbox.checked
				const promote = container.querySelector('.promowane').checked
				const eventBlock = container.querySelector('.event-block')

				const miasto = eventBlock.querySelector('.miasto').value
				const miastoInne = eventBlock.querySelector('.miasto-inne').value
				const miejsce = eventBlock.querySelector('.miejsce').value
				const miejsceInne = eventBlock.querySelector('.miejsce-inne').value
				const opis = eventBlock.querySelector('.opis').value
				const link = eventBlock.querySelector('.link').value

				const styleActive = Array.from(container.querySelectorAll('input.styl:checked')).map(cb => cb.value)

				// Zapisujemy tylko jeśli cokolwiek jest zmienione/zaznaczone, żeby nie puchło
				if (isChecked || link || opis || miasto !== 'Katowice') {
					events.push({
						checked: isChecked,
						promote: promote,
						miasto,
						miastoInne,
						miejsce,
						miejsceInne,
						opis,
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
		generujPost() // Przy okazji generuj wynik
	}

	/**
	 * Wczytuje stan formularza z localStorage i przywraca wartości pól.
	 * Obsługuje dynamiczne pokazywanie/ukrywanie sekcji "Inne".
	 */
	function wczytajStan() {
		const saved = localStorage.getItem('party_generator_stan')
		if (!saved) return

		try {
			const stan = JSON.parse(saved)
			const blocks = document.querySelectorAll('.day-block')

			stan.forEach(dayData => {
				// Znajdź blok dnia (porównujemy daty, ale uwaga na Timezone - tu używamy ISO stringa z dataset)
				const targetBlock = Array.from(blocks).find(b => b.dataset.date === dayData.date)
				if (!targetBlock) return // Może data już minęła

				const containers = targetBlock.querySelectorAll('.event-container')

				dayData.events.forEach((ev, index) => {
					if (index >= containers.length) return // Więcej eventów niż slotów (max 5)

					const container = containers[index]
					const eventBlock = container.querySelector('.event-block')

					// Checkboxy glowne
					const checkbox = container.querySelector('.toggle-checkbox')
					checkbox.checked = ev.checked

					const promote = container.querySelector('.promowane')
					promote.checked = ev.promote
					if (ev.checked) {
						promote.parentElement.style.display = 'inline-block'
						container.querySelector('.checkboxes').style.display = 'flex'
					}

					eventBlock.style.display = ev.checked ? 'block' : 'none'

					// Pola
					eventBlock.querySelector('.miasto').value = ev.miasto
					eventBlock.querySelector('.miasto-inne').value = ev.miastoInne || ''
					eventBlock.querySelector('.miejsce').value = ev.miejsce
					eventBlock.querySelector('.miejsce-inne').value = ev.miejsceInne || ''
					eventBlock.querySelector('.opis').value = ev.opis || ''
					eventBlock.querySelector('.link').value = ev.link || ''

					// Trigger change dla selectów, żeby pokazać/ukryć pola "Inne"
					const miastoSelect = eventBlock.querySelector('.miasto')
					const miejsceSelect = eventBlock.querySelector('.miejsce')

					// Ręczne wywołanie logiki updateMiejscaOptions (musimy ją wywołać, bo HTML selectów się nie zmienia sam)
					// Ale funkcja updateMiejscaOptions jest w scope pętli generującej... ups.
					// Musimy wyzwolić event 'change' na selectach.

					miastoSelect.dispatchEvent(new Event('change'))
					// Po zmianie miasta, updateuje się miejsce. Musimy ponownie ustawić wartość miejsca, bo resetuje się do pierwszego.
					miejsceSelect.value = ev.miejsce
					miejsceSelect.dispatchEvent(new Event('change'))

					// Style
					const styleCbs = container.querySelectorAll('input.styl')
					styleCbs.forEach(cb => {
						cb.checked = ev.style && ev.style.includes(cb.value)
					})
				})
			})

			generujPost() // Odśwież widok posta
			updateEventCounter() // Odśwież licznik
		} catch (e) {
			console.error('Błąd wczytywania stanu:', e)
		}
	}

	function nasluchujZmian() {
		// Podpinamy się pod wszystko co żyje w #form
		const formContainer = document.getElementById('form')

		formContainer.addEventListener('input', e => {
			zapiszStan()
		})

		formContainer.addEventListener('change', e => {
			zapiszStan()
		})

		// Hashtagi też
		const hashInput = document.getElementById('hashtagi')
		if (hashInput) {
			hashInput.addEventListener('input', zapiszStan)
		}
	}

	// Odpalamy
	nasluchujZmian()
	wczytajStan()
	// ZAWSZE generuj post na starcie, nawet jak nie ma zapisanego stanu (żeby pokazać nagłówek i stopkę)
	if (!localStorage.getItem('party_generator_stan')) {
		generujPost()
	}

	// PRE-FETCH SCRAPER SCRIPT FOR CLIPBOARD
	window.scraperScriptCache = ''
	fetch('tools/fb_scraper.js')
		.then(r => r.text())
		.then(text => {
			window.scraperScriptCache = text
			console.log('Scraper script cached (' + text.length + ' bytes)')
		})
		.catch(console.error)

	// AUTO-PASTE ON WINDOW FOCUS (Restored)
	window.addEventListener('focus', () => {
		// Small delay to ensure focus is active
		setTimeout(() => {
			importujZFacebooka(true) // Silent mode for auto-paste!
		}, 500)
	})

	let lastClipboardContent = ''

	/**
	 * Próbuje odczytać dane ze schowka i zaimportować wydarzenia FB.
	 * Wykorzystuje parser.js do walidacji i deduplikacji danych.
	 * @param {boolean} silent - Czy pomijać komunikaty o błędach (np. przy auto-paste)
	 */
	async function importujZFacebooka(silent = false) {
		let jsonText
		try {
			jsonText = await navigator.clipboard.readText()
			console.log('[Import] Surowe dane ze schowka:', jsonText ? jsonText.substring(0, 100) + '...' : 'PUSTY')
		} catch (err) {
			if (!silent) alert('Błąd odczytu schowka! (Może wymagane kliknięcie w stronę?)')
			return
		}

		if (!jsonText || !jsonText.trim()) {
			if (!silent) alert('Schowek jest pusty!')
			return
		}

		// SMART CHECK:
		if (!jsonText.trim().startsWith('[')) {
			if (!silent)
				alert(
					'Dane w schowku nie wyglądają na format FB (brak nawiasu [ ).\nUpewnij się, że użyłeś skrapera w konsoli.',
				)
			return
		}

		try {
			const { events, skippedReasons } = parseClipboardData(jsonText)

			let importedCount = 0
			let duplicateCount = 0
			let noSpaceCount = 0

			const getIds = url => {
				if (!url) return []
				return url.match(/\d{8,}/g) || []
			}

			events.forEach(ev => {
				const parsedDate = ev.parsedDate
				const evYMD = toYMD(parsedDate)
				console.log(`[Import] Przetwarzanie: "${ev.title}" na dzień ${evYMD}`)
				const dayBlock = Array.from(document.querySelectorAll('.day-block')).find(block => {
					return block.dataset.date === evYMD
				})

				if (!dayBlock) {
					skippedReasons.push(`"${ev.title}": Brak dnia ${evYMD} w kalendarzu (generator obsługuje ${LICZBA_DNI} dni)`)
					return
				}

				console.log(`[Import] Znaleziono blok dnia dla ${parsedDate.getDate()}.${parsedDate.getMonth() + 1}`)
				const newIds = getIds(ev.url)
				// CHECK DUPLICATES IN DAY BLOCK
				const alreadyExists = Array.from(dayBlock.querySelectorAll('.event-block')).some(eb => {
					if (eb.style.display === 'none') return false
					const linkVal = eb.querySelector('.link').value || ''
					if (linkVal && linkVal === ev.url) return true
					const existingIds = getIds(linkVal)
					if (newIds.length > 0 && existingIds.length > 0) {
						if (newIds.some(id => existingIds.includes(id))) return true
					}
					return false
				})

				if (alreadyExists) {
					console.warn(`[Import] Pominięto duplikat: "${ev.title}"`)
					duplicateCount++
					return
				}

				const emptySlot = Array.from(dayBlock.querySelectorAll('.event-block')).find(eb => {
					return eb.style.display === 'none' && !eb.querySelector('.link').value
				})

				if (emptySlot) {
					const container = emptySlot.parentElement
					const eventBlock = emptySlot

					const mainCheckbox = container.querySelector('.toggle-checkbox')
					mainCheckbox.checked = true
					mainCheckbox.dispatchEvent(new Event('change'))
					eventBlock.querySelector('.link').value = ev.url

					const miastoSelect = eventBlock.querySelector('.miasto')
					const miejsceSelect = eventBlock.querySelector('.miejsce')
					const miastoInne = eventBlock.querySelector('.miasto-inne')

					let bestCity = 'Katowice'
					let bestPlace = null

					// PRIORYTETYZACJA: Najpierw sprawdzamy tytuł i opis, bo location z FB często jest błędne (np. Gliwice w Sabrosie)
					const primaryText = ((ev.title || '') + ' ' + (ev.description || '')).toLowerCase()
					const locationText = (ev.location || '').toLowerCase()
					const fullText = primaryText + ' ' + locationText

					let matchedAddr = null
					for (const [addr, place] of Object.entries(adresyMap || {})) {
						// Sprawdzamy najpierw w tytule/opisie
						if (primaryText.includes(addr)) {
							bestPlace = place
							matchedAddr = addr
							break
						}
					}

					// Jeśli nie ma w opisie, sprawdzamy pole location
					if (!bestPlace) {
						for (const [addr, place] of Object.entries(adresyMap || {})) {
							if (locationText.includes(addr)) {
								bestPlace = place
								matchedAddr = addr
								break
							}
						}
					}

					if (!bestPlace) {
						for (const city of Object.keys(miejscaWgMiasta || {})) {
							if (fullText.includes(city.toLowerCase())) {
								bestCity = city
								const places = miejscaWgMiasta[city]
								for (const p of places) {
									if (fullText.includes(p.toLowerCase())) {
										bestPlace = p
										break
									}
								}
								break
							}
						}
					} else {
						// Jeśli mamy bestPlace, ustalmy miasto.
						// 1. Sprawdźmy czy adres ma przypisane sztywne miasto
						if (matchedAddr && adresMiastoSztywne[matchedAddr]) {
							bestCity = adresMiastoSztywne[matchedAddr]
						} else {
							// 2. Fallback: szukaj miasta, które ma to miejsce (może być błędne dla Mohito, jeśli nie ma w adresMiastoSztywne)
							for (const [city, places] of Object.entries(miejscaWgMiasta || {})) {
								if (places.includes(bestPlace)) {
									bestCity = city
									break
								}
							}
						}
					}

					if (bestPlace) {
						miastoSelect.value = bestCity
						miastoSelect.dispatchEvent(new Event('change'))
						miejsceSelect.value = bestPlace
					} else if (ev.location) {
						miastoSelect.value = 'Inne'
						miastoSelect.dispatchEvent(new Event('change'))
						miastoInne.value = ev.location
					} else {
						miastoSelect.value = 'Katowice'
						miastoSelect.dispatchEvent(new Event('change'))
					}

					const checkboxes = eventBlock.querySelectorAll('input.styl')
					checkboxes.forEach(cb => (cb.checked = false))
					Object.entries(styleKeywords || {}).forEach(([key, val]) => {
						if (fullText.includes(key)) {
							const cb = Array.from(checkboxes).find(c => c.value === val)
							if (cb) cb.checked = true
						}
					})

					// Auto-promote
					if (fullText.includes('promowane')) {
						const promoteCb = container.querySelector('.promowane')
						if (promoteCb) {
							promoteCb.checked = true
							promoteCb.dispatchEvent(new Event('change'))
						}
					}

					importedCount++
				} else {
					noSpaceCount++
				}
			})

			if (importedCount > 0) {
				alert(`✅ Zaimportowano ${importedCount} wydarzeń!`)
				zapiszStan()
				generujPost()

				// USUNIĘTO: Automatyczne nadpisywanie schowka skraperem (mogło mylić użytkownika)
				// if (window.scraperScriptCache) navigator.clipboard.writeText(window.scraperScriptCache);
			} else if (!silent) {
				let msg = '❌ Nie zaimportowano żadnych nowych wydarzeń.'
				if (duplicateCount > 0) msg += `\n- Pominięto ${duplicateCount} duplikatów (są już na liście).`
				if (noSpaceCount > 0) msg += `\n- Brak wolnych slotów na wybrane dni dla ${noSpaceCount} wydarzeń!`

				if (skippedReasons.length > 0) {
					msg += '\n\nInne powody:\n' + skippedReasons.slice(0, 3).join('\n')
				}
				alert(msg)
			}
		} catch (e) {
			console.error('Import Error:', e)
			if (!silent) alert('Błąd importu: ' + e.message)
		}
	}

	function updateEventCounter() {
		const count = document.querySelectorAll('.event-block[style*="display: block"]').length
		const counterEl = document.getElementById('event-counter')
		if (counterEl) counterEl.textContent = `Liczba wgranych wydarzeń: ${count}`
	}

	// Obsługa Enter i Auto-Paste w textarea - USUNIĘTE (brak pola tekstowego)
	// const importArea = document.getElementById('import-fb-data');
	// ... logic removed ...

	// --- HELP MODAL ---
	const modal = document.getElementById('help-modal')
	const btnHelp = document.getElementById('help-btn')
	const spanClose = document.getElementsByClassName('close-modal')[0]

	if (btnHelp && modal) {
		btnHelp.onclick = function () {
			// Toggle class 'open' for CSS transition
			// We also need to handle 'display' to ensure it exists in DOM for opacity transition
			// The CSS: .modal { display: none; opacity: 0; visibility: hidden; }
			// .modal.open { display: block; opacity: 1; visibility: visible; }
			// Actually, display:block <-> none breaks transition unless we use keyframes or visibility.
			// Let's rely on class toggling. The CSS I added handles display:block in .open?
			// Let's check CSS. If I used display:none -> display:block, no transition happens for opacity.
			// Better strategy: Always display: flex (or block), but visibility: hidden/visible and opacity.
			// OR: use setTimeout for display.

			// Simpler approach for now: Toggle class. Adjust CSS to support it.
			if (modal.classList.contains('open')) {
				modal.classList.remove('open')
				setTimeout(() => (modal.style.display = 'none'), 400) // Wait for transition
			} else {
				modal.style.display = 'flex' // Ensure layout
				// Force reflow
				void modal.offsetWidth
				modal.classList.add('open')
			}
		}
	}

	if (spanClose && modal) {
		spanClose.onclick = function () {
			modal.classList.remove('open')
			setTimeout(() => (modal.style.display = 'none'), 400)
		}
	}

	if (modal) {
		window.addEventListener('click', function (event) {
			if (event.target == modal) {
				modal.classList.remove('open')
				setTimeout(() => (modal.style.display = 'none'), 400)
			}
		})
	}

	// --- MOBILE WARNING LOGIC ---
	function isMobile() {
		return (
			/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
			window.innerWidth <= 800
		)
	}

	const mobileModal = document.getElementById('mobile-warning-modal')
	const mobileCloseBtn = document.getElementById('mobile-warning-close')

	// Check if user already dismissed, but let's say we show it every session for now or stick to session?
	// User requested: "jak ktos sprobuje wejsc na telefonie niech otrzyma komunikat"
	// Let's use sessionStorage so it doesn't annoy on refresh, but shows on new tab.
	// Let's use sessionStorage so it doesn't annoy on refresh, but shows on new tab.
	const forceMobile = new URLSearchParams(window.location.search).has('mobile')

	if ((isMobile() || forceMobile) && (!sessionStorage.getItem('mobile_warning_dismissed') || forceMobile)) {
		if (mobileModal) {
			mobileModal.style.display = 'flex' // Flex for centering
		}
	}

	if (mobileCloseBtn) {
		mobileCloseBtn.addEventListener('click', () => {
			mobileModal.style.display = 'none'
			sessionStorage.setItem('mobile_warning_dismissed', 'true')
		})
	}

	updateEventCounter()
	updateTitle() // Inicjalizacja tytułu
	initInbox() // Inicjalizacja skrzynki odbiorczej
	initWeather('weather-widget')
})

// --- INBOX HELPER ---
function initInbox() {
	// HARDCODED URL - Ukryty przed widokiem
	const HIDDEN_SHEET_URL =
		'https://docs.google.com/spreadsheets/d/1sI3oU5dNLhWsK0vcct069MENk-o-XuUh9UQ7k-O7Um8/edit?resourcekey=&gid=1833510316#gid=1833510316'

	const checkBtn = document.getElementById('check-inbox-btn')
	const container = document.getElementById('inbox-container')

	checkBtn.addEventListener('click', () => {
		const url = HIDDEN_SHEET_URL

		checkBtn.disabled = true
		checkBtn.textContent = '⏳ Pobieranie...'

		// AUTO-CONVERT GOOGLE SHEETS URL
		let fetchUrl = url
		const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
		if (sheetMatch) {
			const id = sheetMatch[1]
			let gid = '0' // default first sheet

			// Try to find gid in URL parameters or hash
			const gidMatch = url.match(/[?&#]gid=([0-9]+)/)
			if (gidMatch) {
				gid = gidMatch[1]
			}

			fetchUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
			console.log('Konwersja linku Google Sheets:', fetchUrl)
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

				// Assume Row 1 is header, skip it.
				// Rows structure: Timestamp, Link, ...

				const pendingItems = []
				const processed = JSON.parse(localStorage.getItem('party_inbox_done') || '[]')

				// Start from index 1 (skip header)
				for (let i = 1; i < rows.length; i++) {
					const row = rows[i]
					// Smart split for CSV (handling quotes)
					const cols = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || row.split(',')

					const cleanCols = cols.map(c => c.replace(/^"|"$/g, '').trim())

					// Find Link Column
					const linkIndex = cleanCols.findIndex(c => c.includes('facebook.com') || c.includes('fb.me'))

					if (linkIndex !== -1) {
						const link = cleanCols[linkIndex]
						const timestampStr = cleanCols[0]

						// Próba odfiltrowania starych wydarzeń - szukamy daty w każdej kolumnie
						const today = new Date()
						today.setHours(0, 0, 0, 0)

						let bestFoundDate = null
						let shouldSkip = false

						for (const cell of cleanCols) {
							const d = parsujDateFB(cell)
							if (d) {
								// Jeśli jakakolwiek data w rekordzie jest z przeszłości - flagujemy jako "stare"
								if (d < today) {
									shouldSkip = true
									break
								}
								// Zapamiętujemy najlepszą (najwcześniejszą przyszłą?) datę do wyświetlenia
								if (!bestFoundDate || d < bestFoundDate) {
									bestFoundDate = d
								}
							}
						}

						if (shouldSkip) continue

						// Collect other info (skip Timestamp [0] and Link)
						const extraInfo = cleanCols.filter((c, idx) => idx !== 0 && idx !== linkIndex && c.length > 0).join(' | ')

						if (!processed.includes(link)) {
							// Wyświetlamy datę wydarzenia jeśli znaleziono, inaczej timestamp
							const displayDate = bestFoundDate ? formatujDatePL(bestFoundDate) : timestampStr
							pendingItems.push({ date: displayDate, link, info: extraInfo })
						}
					}
				}

				renderInbox(pendingItems)
				checkBtn.disabled = false
				checkBtn.textContent = '🔄 Sprawdź nowe zgłoszenia'
			})
			.catch(err => {
				console.error(err)
				alert('Błąd pobierania CSV. Sprawdź czy link jest poprawny (musi być opublikowany jako CSV).')
				checkBtn.disabled = false
				checkBtn.textContent = '🔄 Sprawdź nowe zgłoszenia'
			})
	})

	function renderInbox(items) {
		container.innerHTML = ''
		if (items.length === 0) {
			container.innerHTML =
				'<div style="color: grey; font-style: italic;">Brak nowych zgłoszeń (lub wszystkie zatwierdzone).</div>'
			return
		}

		items.forEach(item => {
			const link = item.link
			const info = item.info

			const div = document.createElement('div')
			div.className = 'inbox-item'
			div.style.marginBottom = '10px'
			div.style.padding = '10px'
			div.style.border = '1px solid #ddd'
			div.style.borderLeft = '4px solid var(--cuban-red)'
			div.style.background = '#fff'
			div.style.borderRadius = '5px'

			// HEADER: Date + Day
			// We need to pass date from the parsing loop.
			// Assuming 'date' availability. I will update the parsing loop in a separate call if needed.
			// Looking at previous step, I only extracted link and info.
			// But wait, I see in line 947 loop I need to extract DATE.
			// Let's assume for this specific edit I am changing the render logic.
			// BUT I NOTICE I DIDN'T PASS DATE IN PREVIOUS STEPS.
			// I MUST FIX THE PARSING LOOP FIRST OR TOGETHER.

			const headerDiv = document.createElement('div')
			headerDiv.style.fontWeight = 'bold'
			headerDiv.style.color = '#333'
			headerDiv.style.marginBottom = '6px'
			headerDiv.textContent = item.date || 'Brak daty'
			div.appendChild(headerDiv)

			const contentDiv = document.createElement('div')
			contentDiv.style.marginBottom = '8px'
			contentDiv.style.wordBreak = 'break-all' // WRAPPING

			const linkText = document.createElement('a')
			linkText.href = link
			linkText.target = '_blank'
			linkText.textContent = link
			linkText.style.color = 'var(--cuban-blue)'
			linkText.style.textDecoration = 'none'
			linkText.title = 'Kliknij, aby otworzyć i skopiować skrapera!'

			linkText.addEventListener('click', () => {
				if (window.scraperScriptCache) {
					navigator.clipboard.writeText(window.scraperScriptCache).then(() => {
						const originalColor = linkText.style.color
						linkText.style.color = 'green'
						setTimeout(() => (linkText.style.color = originalColor), 1500)
					})
				} else {
					fetch('fb_scraper.js')
						.then(r => r.text())
						.then(t => navigator.clipboard.writeText(t))
				}
			})

			contentDiv.appendChild(linkText)

			if (info) {
				const infoText = document.createElement('div')
				infoText.textContent = info
				infoText.style.fontSize = '0.85em'
				infoText.style.color = '#666'
				infoText.style.marginTop = '2px'
				contentDiv.appendChild(infoText)
			}

			div.appendChild(contentDiv)

			const actions = document.createElement('div')
			actions.style.textAlign = 'right'

			const btnDone = document.createElement('button')
			btnDone.textContent = '✔️ Zatwierdź'
			btnDone.style.background = '#2ed573'
			btnDone.style.padding = '5px 10px'
			btnDone.style.fontSize = '0.85em'
			btnDone.onclick = () => {
				markAsDone(link)
				div.remove()
				if (container.children.length === 0) {
					container.innerHTML = '<div style="color: grey; font-style: italic;">Wszystko zrobione! 🎉</div>'
				}
			}

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

// --- HELPERS TYTUŁOWE ---

function toBoldUnicode(text) {
	const chars = {
		a: '𝐚',
		b: '𝐛',
		c: '𝐜',
		d: '𝐝',
		e: '𝐞',
		f: '𝐟',
		g: '𝐠',
		h: '𝐡',
		i: '𝐢',
		j: '𝐣',
		k: '𝐤',
		l: '𝐥',
		m: '𝐦',
		n: '𝐧',
		o: '𝐨',
		p: '𝐩',
		q: '𝐪',
		r: '𝐫',
		s: '𝐬',
		t: '𝐭',
		u: '𝐮',
		v: '𝐯',
		w: '𝐰',
		x: '𝐱',
		y: '𝐲',
		z: '𝐳',
		A: '𝐀',
		B: '𝐁',
		C: '𝐂',
		D: '𝐃',
		E: '𝐄',
		F: '𝐅',
		G: '𝐆',
		H: '𝐇',
		I: '𝐈',
		J: '𝐉',
		K: '𝐊',
		L: '𝐋',
		M: '𝐌',
		N: '𝐍',
		O: '𝐎',
		P: '𝐏',
		Q: '𝐐',
		R: '𝐑',
		S: '𝐒',
		T: '𝐓',
		U: '𝐔',
		V: '𝐕',
		W: '𝐖',
		X: '𝐗',
		Y: '𝐘',
		Z: '𝐙',
		ą: '𝐚̨',
		ć: '𝐜́',
		ę: '𝐞̨',
		ł: 'ł',
		ń: '𝐧́',
		ó: '𝐨́',
		ś: '𝐬́',
		ź: '𝐳́',
		ż: '𝐳̇',
		Ą: '𝐀̨',
		Ć: '𝐂́',
		Ę: '𝐄̨',
		Ł: 'Ł',
		Ń: '𝐍́',
		Ó: '𝐎́',
		Ś: '𝐒́',
		Ź: '𝐙́',
		Ż: '𝐙̇',
	}
	return text
		.split('')
		.map(c => chars[c] || c)
		.join('')
}

function getWeekNumber(d) {
	d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
	d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
	var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
	var weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
	return weekNo
}

function getTitleString() {
	const today = new Date()
	if (today.getDay() === 0) {
		today.setDate(today.getDate() + 1) // Jeśli Niedziela, liczymy dla Poniedziałku
	}

	const targetDate = new Date()
	targetDate.setDate(targetDate.getDate() + 1)

	const weekNum = getWeekNumber(targetDate)

	const liczebniki = [
		'zerowy',
		'pierwszy',
		'drugi',
		'trzeci',
		'czwarty',
		'piąty',
		'szósty',
		'siódmy',
		'ósmy',
		'dziewiąty',
		'dziesiąty',
		'jedenasty',
		'dwunasty',
		'trzynasty',
		'czternasty',
		'piętnasty',
	]

	let numerTekst = weekNum
	if (weekNum < (liczebniki.length || 0)) numerTekst = liczebniki[weekNum]

	const title = `Zestawienie imprezowe na tydzień ${numerTekst}`
	return `🎉 ${toBoldUnicode(title)}`
}

function updateTitle() {
	// Funkcja zachowana dla kompatybilności wstecznej,
	// choć pole post-title zostało usunięte z HTML
	const title = getTitleString()
	const titleInput = document.getElementById('post-title')
	if (titleInput) titleInput.value = title
}

function kopiujTytul() {
	const titleVal = getTitleString()
	const hashtagi = document.getElementById('hashtagi').value

	const extraText = `

🗓️ PIĄTEK

🗓️ SOBOTA

🗓️ NIEDZIELA


linki w komentarzu

${hashtagi}`

	navigator.clipboard.writeText(titleVal + extraText)
	alert('Szkielet zestawienia skopiowany!')
}

/**
 * Główna funkcja generująca treść posta oraz przyciski ankiety.
 * Zbiera dane ze wszystkich aktywnych bloków dni i wydarzeń.
 */
function generujPost() {
	updateTitle()
	const blocks = document.querySelectorAll('.day-block')
	let wynik = '🎉 Zestawienie imprezowe:\n\n'
	let wynikAnkieta = ''

	blocks.forEach(block => {
		if (block.style.display === 'none') return

		const containers = block.querySelectorAll('.event-block')
		const dzienTekst = block.querySelector('h3').textContent
		let dzienWiersz = ''

		containers.forEach(eventBlock => {
			// Checkbox: toggle-checkbox jest w labelu, który jest poprzednikiem eventBlocka?
			// Struktura DOM:
			// div > label(toggle) > checkbox
			// div > eventBlock
			// Nie. W generowaniu (linia 85): container (div) -> toggle (label) -> checkbox
			//                                               -> eventBlock
			// Więc eventBlock.previousElementSibling to toggle.

			const toggleLabel = eventBlock.previousElementSibling
			const checkbox = toggleLabel.querySelector('input[type=checkbox]')

			if (!checkbox || !checkbox.checked) return

			const miasto = eventBlock.querySelector('.miasto')
			const miastoInne = eventBlock.querySelector('.miasto-inne')
			const miejsce = eventBlock.querySelector('.miejsce')
			const miejsceInne = eventBlock.querySelector('.miejsce-inne')
			const link = eventBlock.querySelector('.link')
			const container = eventBlock.parentElement
			const styleCbs = container.querySelectorAll('input.styl:checked')
			// Promote checkbox teraz jest w headerze (toggle-checkbox sibling)
			const promote = toggleLabel.querySelector('.promowane').checked

			const finalMiasto = miasto.value === 'Inne' ? miastoInne.value.trim() : miasto.value
			const finalMiejsce = miejsce.value === 'Inne' ? miejsceInne.value.trim() : miejsce.value
			const styleTekst = [...styleCbs].map(cb => cb.value).join('/')

			const prefix = promote ? '⭐ ' : '➡️ '
			dzienWiersz += `${prefix}${finalMiasto}: ${finalMiejsce} (${styleTekst})\n`
			if (link.value.trim()) dzienWiersz += `🔗 ${link.value.trim()}\n`

			wynikAnkieta += `${dzienTekst}: ${finalMiasto} - ${finalMiejsce} (${styleTekst})\n`
		})

		if (dzienWiersz) wynik += `🗓️ ${dzienTekst}:\n${dzienWiersz}\n`
	})

	wynik += '@wszyscy Do zobaczenia na parkiecie! 💃🕺\n\n'
	wynik +=
		'📝 PS1: Chcesz zgłosić imprezę? Wypełnij krótki formularz, a dodamy ją do następnego zestawienia: 👉 https://tiny.pl/2bc8z7649\n\n'
	wynik +=
		'📻 PS2: Chcesz posłuchać radia gdzie puszczają salsę bez reklam i w dodatku z opcją zablokowania telefonu? Masz taką opcję na naszej stronie: 👉 https://katosalsahub.pl\n\n'
	wynik +=
		'☕️ PS3: Podoba Ci się to, co robię? Jeśli chcesz, możesz postawić mi wirtualną kawę – to daje mi mega kopa do dalszego działania dla Was! 👉 https://buycoffee.to/katosalsahub\n\n'
	wynik += document.getElementById('hashtagi').value
	document.getElementById('wynik').value = wynik
	document.getElementById('wynik').value = wynik
	// document.getElementById('ankieta').value = wynikAnkieta // USUNIĘTE: User nie chce pola tekstowego, tylko guziki

	const ankietaDiv = document.getElementById('kopiuj-ankiete') || document.createElement('div')
	ankietaDiv.id = 'kopiuj-ankiete'
	// Clear previous
	ankietaDiv.innerHTML = '' // CZYŚCIMY, nagłówek jest w HTML

	// ZMIANA: Append to sidebar container instead of body
	const sidebarContainer = document.getElementById('kopiuj-ankiete-container')
	if (sidebarContainer) {
		sidebarContainer.appendChild(ankietaDiv)
	} else {
		document.body.appendChild(ankietaDiv) // Fallback
	}

	wynikAnkieta
		.trim()
		.split('\n')
		.filter(l => l)
		.forEach(l => {
			const div = document.createElement('div')
			div.className = 'copy-line'
			div.style.marginBottom = '5px'
			const btn = document.createElement('button')
			btn.textContent = '📋 ' + l

			btn.onclick = () => {
				navigator.clipboard.writeText(l)
				btn.textContent = '✅ Skopiowano!'

				btn.classList.add('clicked-poll')

				setTimeout(() => {
					btn.textContent = '✅ ' + l
				}, 1000)
			}
			div.appendChild(btn)
			ankietaDiv.appendChild(div)
		})
}

function kopiujWynik() {
	const text = document.getElementById('wynik').value
	navigator.clipboard.writeText(text)
	alert('Podsumowanie do komentarza skopiowane!')
}

// Eksportujemy funkcje do window, aby były dostępne w HTML onclick
window.kopiujTytul = kopiujTytul
window.kopiujWynik = kopiujWynik
window.generujPost = generujPost
