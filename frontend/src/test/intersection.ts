/**
 * Управляемый `IntersectionObserver` для jsdom (своего у jsdom нет): ставится глобально в
 * `setup.ts`, а тест сам решает, когда наблюдаемые элементы «показались на экране».
 */

const liveObservers = new Set<IntersectionObserverStub>();

export class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  private readonly targets = new Set<Element>();
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    liveObservers.add(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
    liveObservers.delete(this);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Сообщает наблюдателю, что все его элементы на экране. */
  intersectAll(): void {
    const entries = [...this.targets].map(
      (target) => ({ target, isIntersecting: true, intersectionRatio: 1 }) as IntersectionObserverEntry,
    );
    if (entries.length > 0) {
      this.callback(entries, this as unknown as IntersectionObserver);
    }
  }
}

/**
 * «Прокручивает» к каждому наблюдаемому элементу: все живые наблюдатели получают пересечение.
 * Вызывать внутри `act`, если колбэк меняет состояние.
 */
export function intersectAllObserved(): void {
  for (const observer of liveObservers) {
    observer.intersectAll();
  }
}
