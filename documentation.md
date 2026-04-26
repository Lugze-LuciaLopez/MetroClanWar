# Metro Clan War

P2P based faction game that gives you competitive rewards for making use of the Barcelona metro system.

## Overview

The app opens with a personality quiz that determines the metro line you pertain to. After that you win points for your line by travelling with the metro. At the end of the week the line with the most amount of points wins, and this loop repeats every week. The app supports random positive and negative events.

## Project structure

- `frontend/index.html` — main quiz UI and logic
- `README.md` — project documentation

## How to run

1. Open `frontend/index.html` in a web browser.
2. Answer each question.
3. At the end, the app displays your resulting clan.

## Customizing the quiz

- Add or edit questions in the `questions` array in `frontend/index.html`.
- Each question has:
  - `text`
  - `answers` with keys `a`-`g`
  - each answer contains `text` and a `clan` value

## Notes

- The app uses Tailwind CSS via CDN for styling.
- The quiz result is determined by the clan with the highest score after all questions are answered.

```// filepath: c:\Users\Usuario\Desktop\M(e)ATH Python\MetroClanWars\MetroClanWar\README.md
# Metro Clan War

A small frontend quiz app that assigns a user to a metro clan based on their answers.

## Overview

This project contains a single-page quiz experience built with HTML, Tailwind CSS, and vanilla JavaScript. The quiz asks a set of questions and calculates a winning clan based on the selected answers.

## Project structure

- `frontend/index.html` — main quiz UI and logic
- `README.md` — project documentation

## How to run

1. Open `frontend/index.html` in a web browser.
2. Answer each question.
3. At the end, the app displays your resulting clan.

## Customizing the quiz

- Add or edit questions in the `questions` array in `frontend/index.html`.
- Each question has:
  - `text`
  - `answers` with keys `a`-`g`
  - each answer contains `text` and a `clan` value

## Notes

- The app uses Tailwind CSS via CDN for styling.
- The quiz result is determined by the clan with the highest score after all questions are answered.
