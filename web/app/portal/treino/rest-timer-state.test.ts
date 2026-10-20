import assert from "node:assert/strict";
import test from "node:test";
import { REST_ADD_MS, isRestRunning, restReducer, restRemainingMs, type RestTimerState } from "./rest-timer-state";

/** `npx tsx --test app/portal/treino/rest-timer-state.test.ts` */

const T0 = 1_000_000;
const start = (seconds = 60): RestTimerState =>
  restReducer(null, { type: "start", key: "k", label: "Próximo", seconds, now: T0 }) as RestTimerState;

test("contagem corre pelo relógio absoluto", () => {
  const s = start();
  assert.equal(restRemainingMs(s, T0 + 15_000), 45_000);
  assert.equal(restRemainingMs(s, T0 + 90_000), 0);
});

test("pausar congela o restante e NÃO descarta o timer", () => {
  const paused = restReducer(start(), { type: "pause", now: T0 + 20_000 }) as RestTimerState;
  assert.ok(paused);
  assert.equal(isRestRunning(paused), false);
  assert.equal(restRemainingMs(paused, T0 + 20_000), 40_000);
  assert.equal(restRemainingMs(paused, T0 + 500_000), 40_000);
});

test("retomar continua de onde parou", () => {
  const paused = restReducer(start(), { type: "pause", now: T0 + 20_000 }) as RestTimerState;
  const resumed = restReducer(paused, { type: "resume", now: T0 + 100_000 }) as RestTimerState;
  assert.equal(isRestRunning(resumed), true);
  assert.equal(restRemainingMs(resumed, T0 + 100_000), 40_000);
  assert.equal(restRemainingMs(resumed, T0 + 110_000), 30_000);
  // relógio da tela atrasado (antes do primeiro tique) não faz o número subir
  assert.equal(restRemainingMs(resumed, T0 + 20_000), 40_000);
});

test("+30 s soma ao restante, correndo ou pausado", () => {
  const running = restReducer(start(), { type: "add", ms: REST_ADD_MS, now: T0 + 10_000 }) as RestTimerState;
  assert.equal(restRemainingMs(running, T0 + 10_000), 80_000);
  assert.equal(running.totalMs, 90_000);
  assert.equal(isRestRunning(running), true);

  const paused = restReducer(start(), { type: "pause", now: T0 + 10_000 }) as RestTimerState;
  const added = restReducer(paused, { type: "add", ms: REST_ADD_MS, now: T0 + 12_000 }) as RestTimerState;
  assert.equal(isRestRunning(added), false, "continua pausado");
  assert.equal(restRemainingMs(added, T0 + 99_000), 80_000);
});

test("+30 s num descanso zerado recomeça a contar", () => {
  const done = restReducer(start(10), { type: "add", ms: REST_ADD_MS, now: T0 + 60_000 }) as RestTimerState;
  assert.equal(restRemainingMs(done, T0 + 60_000), 30_000);
  assert.equal(isRestRunning(done), true);
  assert.equal(done.totalMs, 30_000);
});

test("pausar o treino congela; retomar devolve o mesmo restante", () => {
  const sp = restReducer(start(), { type: "sessionPause", now: T0 + 5_000 }) as RestTimerState;
  assert.equal(isRestRunning(sp), false);
  assert.equal(restRemainingMs(sp, T0 + 999_000), 55_000);
  const back = restReducer(sp, { type: "sessionResume", now: T0 + 300_000 }) as RestTimerState;
  assert.equal(restRemainingMs(back, T0 + 300_000), 55_000);
});

test("descanso pausado pelo aluno continua pausado ao retomar o treino", () => {
  let s = restReducer(start(), { type: "pause", now: T0 + 5_000 }) as RestTimerState;
  s = restReducer(s, { type: "sessionPause", now: T0 + 6_000 }) as RestTimerState;
  s = restReducer(s, { type: "sessionResume", now: T0 + 90_000 }) as RestTimerState;
  assert.equal(isRestRunning(s), false);
  assert.equal(restRemainingMs(s, T0 + 95_000), 55_000);
  s = restReducer(s, { type: "resume", now: T0 + 100_000 }) as RestTimerState;
  assert.equal(isRestRunning(s), true);
});

test("pular remove o timer; ações sem timer são ignoradas", () => {
  assert.equal(restReducer(start(), { type: "skip" }), null);
  assert.equal(restReducer(null, { type: "pause", now: T0 }), null);
});
