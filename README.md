# StudyBuddy

Study Buddy

## Prezentare:

Aplicația Study Buddy are scopul de a ajuta studenții să își construiască un program zilnic care să gestioneze eficient timpul pentru diversele activități din viața lor. Ne propunem să implementăm un model care va genera un orar adaptat nevoilor utilizatorilor. Acesta va gestiona intervalele de activitate astfel încât să prevină epuizarea (burnout-ul) și procrastinarea. Totodată, aplicația le va oferi utilizatorilor motivație prin diverse metode, cum ar fi menținerea unui streak(serie de zile consecutive) pentru respectarea programului, dar și prin mesaje motivaționale.

De asemenea, aplicația va include o funcționalitate care constă într-un sistem de recomandare a cafenelelor sau a locurilor optime pentru învățat. Aceste locații vor fi clasificate pe baza recenziilor de pe Google Maps, dar utilizatorii noștri vor putea adăuga și propriile recenzii, direct din aplicație. În plus, vom afișa un indicator de aglomerare pentru ora de interes. Vom încerca să implementăm acest lucru folosind un API care preia date în timp real despre locația dorită, deși, cel mai probabil, vom fi limitați de perioada de free trial oferită. O altă variantă, ceva mai greoi, ar fi utilizarea unui API de tip web scraper, care va extrage informația direct de pe Google.

## Caracteristici principale:
- Generare inteligentă a orarului: Crearea automată a unui program zilnic - echilibrat, adaptat nevoilor utilizatorului, care alternează perioadele de studiu cu cele de relaxare.
- Sistem de Gamificare și Motivare: Implementarea unui sistem de streaks (zile consecutive de respectare a programului) și trimiterea de mesaje motivaționale zilnice.
- Study Spot Finder: Un sistem de recomandare a celor mai bune cafenele și spații de învățat, bazat pe recenzii Google Maps.
- Sistem intern de recenzii: Posibilitatea utilizatorilor de a lăsa propriile păreri și rating-uri despre locațiile de studiu, direct din aplicație.
- Indicator de aglomerare (Crowded Level): Afișarea în timp real a gradului de ocupare pentru locațiile de studiu dorite.
- Scanare orar și teme: Importarea rapidă a programului de la facultate și a deadline-urilor.
- Asistentul Virtual „Ducky Buddy”: Un chatbot interactiv care ajută la gestionarea sarcinilor, oferă suport și menține utilizatorul motivat.
- Integrare cu calendare externe: Sincronizarea bidirecțională cu Google Calendar sau Apple Calendar, pentru a nu exista suprapuneri cu alte planuri personale.
- Modul „Burnout Rescue”: Un buton de urgență pe care studentul îl poate apăsa când se simte copleșit; Ducky Buddy va reprograma automat sarcinile mai puțin urgențe pentru zilele următoare și va sugera o pauză. 
- Modul “Milestones”: Aplicația va tine cont de activitatea utilizatorilor pe timpul facultății. Un sistem de badge-uri cu care vor fi premiați utilizatorii pe baza unui “good behaviour”` (ex: realizarea taskurilor la timp, participarea la cat mai multe activitati din orar)
