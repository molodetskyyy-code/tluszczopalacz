# Tłuszczopalacz

Prosta aplikacja PWA do pilnowania tygodniowego deficytu kalorii. Działa lokalnie w przeglądarce i po pierwszym uruchomieniu może działać offline.

## Jak działa

- tydzień trwa od poniedziałku do niedzieli;
- pierwszy niepełny tydzień ma cel proporcjonalny do liczby pozostałych dni;
- pusty zakończony dzień jest rozliczany tak, jakby wykonano jego plan; dopiero zapisany wynik tworzy korektę dla kolejnych dni;
- BMR jest liczone wzorem Mifflina–St Jeora;
- wydatek dnia = BMR + aktywne kcal wpisane przez użytkownika;
- faktyczny deficyt dnia = BMR + aktywne kcal − zjedzone kcal;
- aplikacja nie stosuje mnożnika aktywności ani minimalnego limitu kalorii;
- po zapisaniu dnia jego BMR, limit i planowany deficyt są zamrożone;
- różnica względem celu jest rozkładana wyłącznie na kolejne dni do niedzieli;
- aktywne kcal zwiększają limit dnia po ich wpisaniu;
- limit jedzenia = BMR + aktywne kcal − wymagany deficyt dnia.
- zakładka „Postęp” pokazuje realne podsumowanie wybranego miesiąca wyłącznie z zapisanych dni: deficyt, zjedzone i aktywne kcal, średnią oraz szacowaną zmianę tłuszczu.

Obliczenia BMR i wydatku energetycznego są szacunkowe i nie zastępują porady lekarza lub dietetyka.

## Uruchomienie

Najlepiej udostępnić folder przez dowolny prosty serwer HTTP. Przykład:

```bash
python3 -m http.server 8080
```

Następnie otwórz `http://localhost:8080`. Na iPhonie użyj Safari → Udostępnij → Dodaj do ekranu początkowego.

## Test logiki

```bash
node logic.test.js
```
