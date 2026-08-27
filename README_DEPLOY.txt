力の復習ラボ＋ AI先生版 v2
================================

【今回の重要変更】
1. ChatGPT内のHTMLプレビューでも「送る」が反応します。
   ただし、その場合は「教材内AI（デモ）」です。
   本物の生成AIは、GitHub→EdgeOneへ配置して /api/tutor が動いてから接続します。

2. AI先生は質問を待つだけではありません。
   「よく話す」が初期設定で、次のタイミングに自分から声をかけます。
   - 説明画面に入ったとき
   - 問題を始めたとき
   - 間違えたとき
   - 連続で正解して理解が進んだとき
   - 問題画面で手が35秒ほど止まったとき
   うるさければ「ひかえめ」「OFF」にできます。

3. 授業コードをURLに入れられます。
   例:
   https://あなたのサイト.edgeone.dev/?class=RIKA35
   このURLを生徒へ配れば、各端末で授業コード入力を省略できます。

【GitHubに置くもの】
index.html
edge-functions/
  api/
    tutor.js
    tutor-status.js

【EdgeOne Makers】
GitHubリポジトリをImportしてデプロイ。

Environment Variables / Secrets:
- OPENAI_API_KEY : Secret推奨。OpenAI API key
- CLASS_CODE : 任意。例 RIKA35
- TUTOR_MODEL : 任意。既定 gpt-5.6-luna
- TUTOR_MODEL_CHALLENGE : 任意。既定 gpt-5.6-terra

CLASS_CODEを設定した場合：
  生徒用URLを ?class=RIKA35 付きにすると楽です。
CLASS_CODEを設定しない場合：
  授業コードなしでAI接続できますが、公開URLを知る人がAPIを使えるため非推奨です。

【授業前テスト】
1. 公開URLを開く
2. AI欄の表示が「生成AI 接続済み」または「生成AI 接続準備OK」になるか
3. 「なんで？」を押して返答が来るか
4. 問題を間違える → AIが自分から短いヒントを出すか
5. 2〜3問正解 → AIが理解に応じた声かけをするか
6. 35秒ほど問題画面で何もしない → 声かけが出るか
7. 「🔥難問」→ 考察問題 → 自分の考えを送る → 評価と次の問いが返るか

【プレビューでの表示】
「プレビュー：教材内AI」
  = 本物のOpenAI APIにはまだつながっていません。
「生成AI 接続済み」
  = 本物のAIへ接続されています。
「授業コード待ち」
  = EdgeOne側は生きていますが、CLASS_CODEが必要です。

【プライバシー】
名前・住所・連絡先などの個人情報は入力させません。
送るのは現在の問題、モード、誤答状況、描いた矢印など学習に必要な文脈です。
