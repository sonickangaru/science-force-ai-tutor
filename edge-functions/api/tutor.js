// EdgeOne Makers 無料内蔵モデル版
// 必要な環境変数:
//   MAKERS_MODELS_KEY  : EdgeOne Makers > Models > API Key で作るキー
//   CLASS_CODE        : 任意。授業コード
//
// OpenAIへの課金APIキーは不要です。
// EdgeOne MakersのOpenAI互換AI Gateway + 内蔵モデルを使います。

const SYSTEM = `
あなたは日本の中学生向け理科「力」単元専属のAI教師です。
目的は、答えを言うことではなく、生徒が自力で理解し説明できる状態へ導くこと。

扱う範囲:
- 力の3つのはたらき：変形、運動のようすを変える、支える
- 重力、弾性力、磁力、電気力、摩擦力、垂直抗力、張力
- 力の単位N、100gの物体にはたらく重力を約1Nとする中学での近似
- 力の矢印：作用点、向き、大きさ
- 2力のつり合い：大きさが等しい、反対向き、同一直線上
- 圧力：面を垂直に押す力(N)÷面積(m²)、Pa、cm²→m²
- 大気圧：あらゆる向き、高い場所ほど小さい
- 次単元への入口として簡単な力の合成

指導:
- やさしいモード：一度に1段階。具体例。困っていたら徐々にヒントを強くする。
- 標準：ヒント→問い返し→説明。正解でも理由を確認することがある。
- チャレンジ：反例、比較、予測、説明、条件変更、誤答分析、身近な適用を使う。
- 生徒が考察を書いたら、必ず「良い点→直す点→次の一問」の順で返す。
- 個人情報を聞かない。
- 日本語で自然に。1回答は基本60〜180字程度。
- 数式と単位は正確に。
- 内部の思考過程は示さず、生徒に役立つ短い根拠だけ示す。

必ず次のJSONだけを返す。Markdownのコードフェンスは禁止。
{
  "reply":"生徒への返事",
  "coach_move":"explain|hint|question|evaluate|challenge|encourage|redirect のどれか",
  "challenge":"追加課題。不要なら空文字",
  "mastery_signal":"needs_support|developing|strong|unknown のどれか",
  "suggested_mode":"easy|normal|challenge|keep のどれか"
}
`;

function jsonResponse(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store"
    }
  });
}

function env(context,name){
  return context?.env?.[name] ?? globalThis?.[name] ?? undefined;
}

function compactContext(ctx){
  if(!ctx || typeof ctx!=="object") return {};
  return {
    screen:ctx.screen,
    mode:ctx.mode,
    runType:ctx.runType,
    unit:ctx.unit,
    title:ctx.title,
    problem:typeof ctx.problem==="string"?ctx.problem.slice(0,500):ctx.problem,
    visibleSupport:typeof ctx.visibleSupport==="string"?ctx.visibleSupport.slice(0,300):undefined,
    feedback:typeof ctx.feedback==="string"?ctx.feedback.slice(0,350):undefined,
    stage:ctx.stage,
    studentAnswer:ctx.studentAnswer,
    currentArrows:Array.isArray(ctx.currentArrows)?ctx.currentArrows.slice(0,4):undefined,
    hintVisible:ctx.hintVisible,
    hintLevel:ctx.hintLevel,
    learner:ctx.learner ? {
      wrongQuiz:ctx.learner.wrongQuiz,
      wrongForce:ctx.learner.wrongForce,
      wrongPressure:ctx.learner.wrongPressure,
      correctStreak:ctx.learner.correctStreak
    } : undefined
  };
}

function extractJson(text){
  if(!text) return null;
  let s=String(text).trim();
  s=s.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
  try{return JSON.parse(s)}catch(_){}
  const a=s.indexOf("{"), b=s.lastIndexOf("}");
  if(a>=0 && b>a){
    try{return JSON.parse(s.slice(a,b+1))}catch(_){}
  }
  return null;
}

export async function onRequestOptions(){
  return new Response(null,{status:204,headers:{
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type, X-Class-Code"
  }});
}

export async function onRequestPost(context){
  try{
    const makersKey=env(context,"MAKERS_MODELS_KEY");
    const classCode=env(context,"CLASS_CODE");

    if(!makersKey){
      return jsonResponse({error:"EdgeOneのMAKERS_MODELS_KEYが未設定です。"},500);
    }

    if(classCode){
      const supplied=context.request.headers.get("X-Class-Code")||"";
      if(supplied!==String(classCode)){
        return jsonResponse({error:"授業コードが違います。"},401);
      }
    }

    const body=await context.request.json();
    const message=String(body?.message||"").slice(0,1200).trim();
    if(!message) return jsonResponse({error:"質問が空です。"},400);

    const ctx=compactContext(body?.context||{});
    const history=Array.isArray(body?.history)
      ? body.history.slice(-4).map(m=>({
          role:m?.role==="assistant"?"assistant":"user",
          content:String(m?.content||"").slice(0,500)
        }))
      : [];

    const prompt=`現在の学習状況:
${JSON.stringify(ctx)}

生徒の発言:
${message}

この生徒に今ちょうどよい一手を返してください。`;

    const r=await fetch("https://ai-gateway.edgeone.link/v1/chat/completions",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${makersKey}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:"@makers/deepseek-v4-flash",
        messages:[
          {role:"system",content:SYSTEM},
          ...history,
          {role:"user",content:prompt}
        ],
        temperature:0.35,
        max_tokens:320,
        stream:false
      })
    });

    const data=await r.json();
    if(!r.ok){
      console.error("Makers Models error",r.status,data);
      return jsonResponse({error:"無料AIモデルへの接続に失敗しました。Modelsのキーと無料枠を確認してください。"},502);
    }

    const text=data?.choices?.[0]?.message?.content||"";
    const parsed=extractJson(text);

    if(!parsed){
      return jsonResponse({
        reply:text || "今の問題をもう一度、一緒に見よう。",
        coach_move:"explain",
        challenge:"",
        mastery_signal:"unknown",
        suggested_mode:"keep"
      });
    }

    return jsonResponse({
      reply:String(parsed.reply||"一緒に考えよう。"),
      coach_move:["explain","hint","question","evaluate","challenge","encourage","redirect"].includes(parsed.coach_move)?parsed.coach_move:"explain",
      challenge:String(parsed.challenge||""),
      mastery_signal:["needs_support","developing","strong","unknown"].includes(parsed.mastery_signal)?parsed.mastery_signal:"unknown",
      suggested_mode:["easy","normal","challenge","keep"].includes(parsed.suggested_mode)?parsed.suggested_mode:"keep"
    });
  }catch(err){
    console.error(err);
    return jsonResponse({error:"AI先生で通信エラーが起きました。"},500);
  }
}

export default async function onRequest(context){
  if(context.request.method==="OPTIONS") return onRequestOptions(context);
  if(context.request.method==="POST") return onRequestPost(context);
  return jsonResponse({error:"POSTで利用してください。"},405);
}
