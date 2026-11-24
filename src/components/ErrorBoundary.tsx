import { Component, type ReactNode } from "react";

/** 画面の描画中にエラーが起きたとき、真っ白・真っ暗にせず内容と再読み込みボタンを出す */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("画面の描画でエラーが起きました", error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex max-w-lg flex-col gap-3 p-6 text-sm text-foreground">
        <p className="text-base font-semibold">画面の表示でエラーが起きました</p>
        <p className="text-muted-foreground">設定は自動で保存されています。再読み込みすると元に戻ります。</p>
        <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{error.message}</pre>
        <button
          type="button"
          className="self-start rounded-lg bg-primary px-3 py-1.5 text-primary-foreground"
          onClick={() => location.reload()}
        >
          再読み込み
        </button>
      </div>
    );
  }
}
