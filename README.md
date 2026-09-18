# Tłuszczopalacz

Prosta aplikacja PWA do pilnowania tygodniowego deficytu kalorii. Działa lokalnie w przeglądarce i po pierwszym uruchomieniu może działać offline.

## Jak działa

- tydzień trwa od poniedziałku do niedzieli;
- pierwszy niepełny tydzień ma cel proporcjonalny do liczby pozostałych dni;
- BMR jest liczone wzorem Mifflina–St Jeora;
- bazowe TDEE = BMR × wybrany poziom codziennej aktywności bez treningu;
- faktyczny deficyt dnia = bazowe TDEE + aktywne kcal − zjedzone kcal;
- po zapisaniu dnia jego BMR, TDEE, limit i planowany deficyt są zamrożone;
- różnica względem celu jest rozkładana wyłącznie na kolejne dni do niedzieli;
- aktywne kcal zwiększają limit dnia po ich wpisaniu;
- rekomendowany limit nie spada poniżej 1200 kcal dla kobiet i 1500 kcal dla mężczyzn. Jeśli cel wymaga więcej, aplikacja pokazuje potrzebną aktywność lub sugeruje łagodniejszy cel.

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
