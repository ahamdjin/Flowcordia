declare module "@trigger.dev/sdk" {
  export const metadata: {
    set(key: string, value: unknown): void;
  };

  export function task<TOutput>(definition: {
    id: string;
    run(payload: unknown): Promise<TOutput>;
  }): unknown;

  export const wait: {
    for(input: { seconds: number }): Promise<void>;
  };
}
