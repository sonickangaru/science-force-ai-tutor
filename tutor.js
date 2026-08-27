// EdgeOne Makers: ./edge-functions/api/tutor.js -> /api/tutor
// Secrets to configure in EdgeOne:
// OPENAI_API_KEY, CLASS_CODE
// Optional: TUTOR_MODEL, TUTOR_MODEL_CHALLENGE

const TUTOR_INSTRUCTIONS = `
あなたは日本の中学生向け理科「力」単元専属のAI教師。
目的は、答えを言うことではなく、生徒が自力で理解し説明できる状態へ導くこと。

【扱う範囲】
- 力の3つのはたらき：変形、運動のようすを変える、支える
- 力の種類：重力、弾性力、磁力、電気力、摩擦力、垂直抗力、張力
- 力の単位N、100gの物体にはたらく重力を約1Nとする中学での近似
- 力の矢印：作用点、向き、大きさ
- 2力のつり合い：大きさが等しい、反対向き、同一直線上
- 圧力：面を垂直に押す力(N)÷面積(m²)、Pa、cm²→m²
- 大気圧：あらゆる向き、高い場所ほど小さい、約1013hPa
- 次単元への入口として簡単な力の合成

【個別最適化】
やさしいモード：
- まず「どこまで分かっているか」を肯定的に拾う。
- 1回に1段階だけ教える。短く、具体例を使う。
- 原則として答えを即答しない。「ここを見る→考える→答える」の順。
- 生徒が2回以上困っている、または答えを確認したい段階なら答えを示してよい。その際も理由を1文つける。
- 「分からない」を責めない。幼すぎる言い回しにはしない。

標準モード：
- ヒント→問い返し→説明の順で、自力解決を促す。
- 正解でも理由を確認できる問いを時々返す。

チャレンジモード：
- 単なる数字の難化ではなく、反例、比較、予測、説明、条件変更、誤答分析、身近な現象への適用を使う。
- 生徒の考察に対して、最初に判定（筋が通る/一部修正/再考）を明確にし、その根拠を短く伝える。
- 正解ならさらに一段深い問いを出してよい。
- 中学範囲を超える知識は「発展」と明示し、必須扱いしない。

【会話ルール】
- 日本語。生徒に近い自然な口調だが、ふざけすぎない。
- 1回答は基本80〜220字程度。必要なら少し長くしてよい。
- 数式や単位は正確に。
- 現在のゲーム画面・問題・誤答回数を文脈として使う。
- 生徒が自分の説明や考察を書いたら、必ず内容を評価し、良い点→直す点→次の一問の順で返す。
- 問題と無関係な雑談には短く応じたあと、力の学習へ戻す。
- 個人情報を聞かない。
- 内部の思考過程は示さず、生徒に役立つ短い根拠・ヒントだけ示す。

【challengeの使い方】
- 生徒が難問を求めた、理解が強そう、またはチャレンジモードなら、必要に応じてchallengeへ1問だけ入れる。
- challengeには答えを書かない。
- それ以外は空文字にする。
`;

const schema = {
  type: "object",
  properties: {
    reply: {type:"string"},
    coach_move: {
      type:"string",
      enum:["explain","hint","question","evaluate","challenge","encourage","redirect"]
    },
    challenge: {type:"string"},
    mastery_signal: {type:"string", enum:["needs_support","developing","strong","unknown"]},
    suggested_mode: {type:"string", enum:["easy","normal","challenge","keep"]}
  },
  required:["reply","coach_move","challenge","mastery_signal","suggested_mode"],
  additionalProperties:false
};

function jsonResponse(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store"
    }
  });
}
function getEnv(context,name){
  return context?.env?.[name] ?? globalThis?.[name] ?? undefined;
}
function extractOutputText(data){
  if(typeof data?.output_text==="string" && data.output_text)return data.output_text;
  for(const item of (data?.output||[])){
    if(item?.type!=="message")continue;
    for(const c of (item.content||[])){
      if(c?.type==="output_text" && typeof c.text==="string")return c.text;
    }
  }
  return "";
}

export async function onRequestOptions(){
  return new Response(null,{status:204,headers:{
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type, X-Class-Code"
  }});
}

export async function onRequestPost(context){
  try{
    const apiKey=getEnv(context,"OPENAI_API_KEY");
    const classCode=getEnv(context,"CLASS_CODE");
    if(!apiKey)return jsonResponse({error:"サーバーにOPENAI_API_KEYが設定されていません。"},500);
    if(classCode){
      const supplied=context.request.headers.get("X-Class-Code")||"";
      if(supplied!==String(classCode))return jsonResponse({error:"授業コードが違います。"},401);
    }

    const body=await context.request.json();
    const message=String(body?.message||"").slice(0,1800);
    const ctx=body?.context||{};
    const history=Array.isArray(body?.history)?body.history.slice(-8):[];

    if(!message.trim())return jsonResponse({error:"質問が空です。"},400);

    const isChallenge =
      ctx?.mode==="challenge" ||
      /難問|むずか|難しい|発展|考察|骨のある|チャレンジ/.test(message);
    const model=isChallenge
      ? (getEnv(context,"TUTOR_MODEL_CHALLENGE")||"gpt-5.6-terra")
      : (getEnv(context,"TUTOR_MODEL")||"gpt-5.6-luna");

    const safeHistory=history.map(m=>({
      role:m.role==="assistant"?"assistant":"user",
      content:String(m.content||"").slice(0,1200)
    }));

    const dynamic = `
現在のゲーム状況(JSON):
${JSON.stringify(ctx).slice(0,7000)}

生徒の今の発言:
${message}

この生徒にとって今ちょうどよい一手を返してください。
`;

    const requestBody={
      model,
      store:false,
      instructions:TUTOR_INSTRUCTIONS,
      input:[
        ...safeHistory,
        {role:"user",content:dynamic}
      ],
      reasoning:{effort:isChallenge?"medium":"low"},
      max_output_tokens:650,
      text:{
        verbosity:"low",
        format:{
          type:"json_schema",
          name:"science_tutor_response",
          strict:true,
          schema
        }
      }
    };

    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${apiKey}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify(requestBody)
    });

    const data=await r.json();
    if(!r.ok){
      console.error("OpenAI error",r.status,data);
      return jsonResponse({error:"AI先生の応答に失敗しました。少し待ってもう一度試してください。"},502);
    }

    const raw=extractOutputText(data);
    let parsed;
    try{parsed=JSON.parse(raw)}
    catch(e){
      console.error("Tutor JSON parse error",raw);
      return jsonResponse({
        reply: raw || "今の問題をもう一度一緒に見よう。",
        coach_move:"explain",challenge:"",
        mastery_signal:"unknown",suggested_mode:"keep"
      });
    }
    return jsonResponse(parsed);
  }catch(err){
    console.error(err);
    return jsonResponse({error:"AI先生で通信エラーが起きました。"},500);
  }
}

export default async function onRequest(context){
  if(context.request.method==="OPTIONS")return onRequestOptions(context);
  if(context.request.method==="POST")return onRequestPost(context);
  return jsonResponse({error:"POSTで利用してください。"},405);
}
