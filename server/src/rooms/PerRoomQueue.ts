export class PerRoomQueue {
  readonly #tails = new Map<string, Promise<void>>();

  run<Result>(roomCode: string, work: () => Promise<Result> | Result): Promise<Result> {
    const previous = this.#tails.get(roomCode) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );

    this.#tails.set(roomCode, tail);
    void tail.finally(() => {
      if (this.#tails.get(roomCode) === tail) {
        this.#tails.delete(roomCode);
      }
    });

    return result;
  }
}
