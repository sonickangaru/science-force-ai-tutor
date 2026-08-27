// 力の復習ラボ AI先生 - 教師品質優先版
// EdgeOne Makers Models 無料内蔵モデル + 教材ロジックのハイブリッド
//
// Environment Variables:
//   MAKERS_MODELS_KEY : EdgeOne Makers > Models > API Key
//   CLASS_CODE        : 任意の授業コード
//
// 方針:
// - 基本問題・ヒント・誤答指導は教材側で正確に返す（AIガチャにしない）
// - 「なぜ？」「考察」「自分の説明の評価」などは生成AIへ
// - 生成AIが失敗しても、今の問題に合った返答へフォールバックする

const FORCE = [
  null,
  {easy:"まず200gをNに直そう。100g→約1Nだから、200gは何N？ そのあと重力は『鉛直下向き』。中心の○から描こう。", expected:[["center",0,2]]},
  {easy:"机が物体を支える力は、机との接点から上向き。200gなので重力と同じ大きさになるよ。", expected:[["bottom",0,-2]]},
  {easy:"400g→約4N。静止しているので、下向きの重力4Nと上向きの垂直抗力4Nを両方描こう。", expected:[["bottom",0,-4],["center",0,4]]},
  {easy:"300g→約3N。中心から下へ重力3N、ひもとの接点から上へ張力3N。静止だから大きさは同じ。", expected:[["top",0,-3],["center",0,3]]},
  {easy:"左右から3Nずつ。結び目の左端から左へ3マス、右端から右へ3マス。", expected:[["left",-3,0],["right",3,0]]},
  {easy:"左端から右へ2N、右端から左へ4N。作用点が左右で違うことに注意。", expected:[["left",2,0],["right",-4,0]]},
  {easy:"4本あるよ。右3N・左3N・上2N・下2N。まず上下2本から描いてもOK。", expected:[["left",3,0],["bottom",0,-2],["center",0,2],["bottom",-3,0]]},
  {easy:"一定の速さなので左右はつり合う。右向き3Nなら摩擦力は左向き3N。", expected:[["right",3,0],["bottom",-3,0]]},
  {easy:"下端から上へ4N、上端から下へ1N。『どこから』を先に決めよう。", expected:[["bottom",0,-4],["top",0,1]]},
  {easy:"右側面中央から右へ4N、上辺中央から上へ3N。作用点を取り違えないように。", expected:[["right",4,0],["top",0,-3]]}
];

const PRESSURE = [
  null,
  {f:20,a:4,ans:5},
  {f:60,a:3,ans:20},
  {f:150,a:0.5,ans:300},
  {f:100,a:0.2,ans:500},
  {f:600,a:0.04,ans:15000},
  {f:50,a:0.02,ans:2500,convert:"200cm²＝0.02m²"},
  {f:40,a:0.02,ans:2000},
  {f:150,a:0.005,ans:30000}
];

function j(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store"
    }
  });
}
function env(c,n){ return c?.env?.[n] ?? globalThis?.[n] ?? undefined; }

function response(reply, challenge=""){
  return {
    reply,
    coach_move:"",          // 画面に「指導: explain」を出さない
    challenge,
    mastery_signal:"unknown",
    suggested_mode:"keep"
  };
}

function arrowName(dx,dy){
  if(dx===0 && dy>0) return "下向き";
  if(dx===0 && dy<0) return "上向き";
  if(dx>0 && dy===0) return "右向き";
  if(dx<0 && dy===0) return "左向き";
  return "斜め";
}
function expectedN(dx,dy){ return Math.max(Math.abs(dx),Math.abs(dy)); }

function forceSpecific(ctx, kind="hint"){
  const st=FORCE[Number(ctx?.stage)||0];
  if(!st) return "力の矢印は、①作用点 ②向き ③大きさ、の順に1つずつ確認しよう。";
  const arr=Array.isArray(ctx?.currentArrows)?ctx.currentArrows:[];
  if(!arr.length) return st.easy;

  // 1本目を、まだ満たされていない正解矢印と比べる
  const used = new Set();
  let firstProblem = null;
  for(const a of arr){
    let matched = -1;
    for(let i=0;i<st.expected.length;i++){
      if(used.has(i)) continue;
      const e=st.expected[i];
      if(a.start===e[0] && Number(a.dx)===e[1] && Number(a.dy)===e[2]){ matched=i; break; }
    }
    if(matched>=0){ used.add(matched); continue; }

    // 近い正解を探す
    let e = st.expected.find(x=>x[0]===a.start) || st.expected[0];
    const wantDir=arrowName(e[1],e[2]), gotDir=arrowName(Number(a.dx),Number(a.dy));
    const wantN=expectedN(e[1],e[2]), gotN=Number(a.lengthN)||0;

    if(a.start!==e[0]){
      firstProblem=`今の矢印は始める場所を見直そう。この力は「${pointLabel(e[0])}」から出す。向きと長さはそのあとでOK。`;
    }else if(gotDir!==wantDir){
      firstProblem=`今の矢印は${gotDir}になってる。ここは${wantDir}。作用点は合ってるから、向きだけ直してみよう。`;
    }else if(Math.abs(gotN-wantN)>0.15){
      firstProblem=`向きと作用点はかなりいい。長さだけ確認しよう。1マス＝1Nだから、この力は${wantN}マス。`;
    }else{
      firstProblem=`惜しい。作用点・向き・長さを1つずつ正解と照らそう。${st.easy}`;
    }
    break;
  }
  if(firstProblem) return firstProblem;
  const remain=st.expected.length-used.size;
  if(remain>0) return `今描いた${used.size}本はOK。あと${remain}本あるよ。${st.easy}`;
  return "全部そろってるように見える。『判定する』を押して確認してみよう。";
}
function pointLabel(p){
  return ({center:"物体の中心",bottom:"物体の下端（接触点）",top:"物体の上端",left:"物体の左端",right:"物体の右端"})[p]||p;
}

function pressureSpecific(ctx, kind="hint"){
  const q=PRESSURE[Number(ctx?.stage)||0];
  if(!q) return "圧力は『面を垂直に押す力(N) ÷ 面積(m²)』。まず問題文から力と面積を拾おう。";
  const v=Number(ctx?.studentAnswer);
  if(kind==="wrong" && Number.isFinite(v) && String(ctx?.studentAnswer||"").trim()!==""){
    if(q.convert && Math.abs(v-(q.f/200))<1e-9){
      return `その計算、cm²の200をそのまま使ってるかも。${q.convert} に直してから、${q.f}÷${q.a} を計算しよう。`;
    }
    return `式は合ってるかな？ 今回は ${q.f}N ÷ ${q.a}m²。答えの単位はPa。計算だけもう一度やってみよう。`;
  }
  if(q.convert) return `まず単位変換が山場。${q.convert}。だから式は ${q.f}÷${q.a}。ここまで作れたらあとは計算。`;
  return `問題文から拾うのは2つだけ。力=${q.f}N、面積=${q.a}m²。圧力＝力÷面積に入れてみよう。`;
}

function quizSpecific(ctx){
  const p=String(ctx?.problem||"");
  const fb=String(ctx?.feedback||"");
  if(/つり合/.test(p+ctx?.title)){
    return "つり合いは『大きさが等しい・向きが反対・同一直線上』の3条件。1個でも欠けたらつり合いではないよ。";
  }
  if(/一定の速さ|一定速度/.test(p)){
    return "『動いている＝力がつり合っていない』ではないよ。一定の速さでまっすぐ進むなら、運動のようすは変化していない。";
  }
  if(/重力/.test(p)){
    return "中学では100g→約1Nで考える。重力の向きはいつも鉛直下向き。";
  }
  if(/大気圧|山/.test(p)){
    return "高い場所ほど、自分より上に積み重なる空気が少ない。そこから考えてみよう。";
  }
  if(/圧力/.test(p)){
    return "圧力は『力÷面積』。同じ力なら、面積が小さいほど圧力は大きい。";
  }
  if(fb) return fb.replace(/\s+/g," ").slice(0,150);
  return "問題文で『何が変わったか』『どの向きか』『同じ物体にはたらく力か』を1つずつ拾おう。";
}

function localTeacher(message,ctx){
  const t=String(message||"");
  const screen=ctx?.screen||"";
  const isHint=/ヒント|分から|わから|困|もう一度|声をかけ|注目|誤答|間違/.test(t);

  if(screen==="forceLab" && isHint) return response(forceSpecific(ctx,/誤答|間違/.test(t)?"wrong":"hint"));
  if(screen==="pressureLab" && isHint) return response(pressureSpecific(ctx,/誤答|間違/.test(t)?"wrong":"hint"));
  if(screen==="quiz" && isHint) return response(quizSpecific(ctx));

  if(/重力って何|重力とは/.test(t))
    return response("重力は、地球が物体を引く力。向きはいつも鉛直下向きやで。中学では100gの物体にはたらく重力を約1Nとして考える。");
  if(/作用点/.test(t))
    return response("作用点は『その力が物体のどこにはたらいていると考えるか』を示す点。力の矢印は、作用点から描き始める。");
  if(/つり合/.test(t) && !/なぜ|なんで|説明|考察/.test(t))
    return response("2力がつり合う条件は3つ。①大きさが等しい ②向きが反対 ③同一直線上。しかも同じ1つの物体にはたらく2力で考える。");
  if(/圧力/.test(t) && !/なぜ|なんで|説明|考察/.test(t))
    return response("圧力＝面を垂直に押す力(N)÷面積(m²)。同じ力なら、狭い面ほど圧力が大きくなる。");
  if(/大気圧/.test(t) && !/なぜ|なんで|説明|考察/.test(t))
    return response("大気圧は空気の重さによる圧力。上からだけでなく、あらゆる向きからはたらく。高い場所ほど小さくなる。");

  if(/難問|チャレンジ|骨のある|発展/.test(t)){
    const u=String(ctx?.unit||"");
    if(/圧力/.test(u)) return response(
      "よし、計算じゃなく考察でいこう。",
      "同じ体重の人が雪の上で沈みにくくなる道具を設計するとしたら、どんな形にする？「力・面積・圧力」を全部使って理由を説明して。"
    );
    if(/つり合/.test(u+ctx?.problem)) return response(
      "よし。『条件を言える』の次へ行こう。",
      "「力がつり合っている物体は必ず止まっている」という説明が間違いだと分かる反例を1つ作り、なぜ反例になるか説明して。"
    );
    return response(
      "よし。矢印を描けるだけじゃなく、説明できるかで勝負。",
      "机の上で静止する物体にはたらく2力を、作用点・向き・大きさの3点から説明して。さらに横から押すと何が追加される？"
    );
  }
  return null; // 生成AIへ
}

const SYSTEM = `
あなたは日本の中学生向け理科「力」単元の個別指導教師。
生徒の現在のゲーム画面・問題・誤答状況を必ず利用して返答する。

重要:
- 「今の問題をもう一度見よう」のような中身のない返事は禁止。
- 今の問題に固有の数値・条件・矢印の状態が文脈にあれば、必ず1つ以上触れる。
- ヒント希望なら答えを丸ごと言わず、一段だけ助ける。
- 生徒の考察への返答は「判定 → 良い点 → 修正点 → 次の問い」。
- 得意な生徒には反例・条件変更・説明・予測を使う。
- 日本語。自然で短め。基本80〜180字。
- 中1範囲を基本とし、発展は発展と明示。
- 個人情報を聞かない。
- Markdownの大見出しや長い箇条書きは使わない。
`;

async function callModel(key,message,ctx,history){
  const advanced =
    ctx?.mode==="challenge" ||
    /なぜ|なんで|理由|説明|考察|評価|難問|チャレンジ|反例|予想|予測/.test(message);
  const model=advanced?"@makers/deepseek-v4-pro":"@makers/deepseek-v4-flash";

  const hist=(Array.isArray(history)?history:[]).slice(-6).map(x=>({
    role:x?.role==="assistant"?"assistant":"user",
    content:String(x?.content||"").slice(0,700)
  }));

  const contextText=JSON.stringify({
    screen:ctx?.screen, mode:ctx?.mode, unit:ctx?.unit, stage:ctx?.stage,
    title:ctx?.title, problem:ctx?.problem,
    currentArrows:ctx?.currentArrows,
    studentAnswer:ctx?.studentAnswer,
    feedback:ctx?.feedback,
    hintLevel:ctx?.hintLevel,
    learner:ctx?.learner
  });

  const r=await fetch("https://ai-gateway.edgeone.link/v1/chat/completions",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${key}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model,
      messages:[
        {role:"system",content:SYSTEM},
        ...hist,
        {role:"user",content:`現在の学習状況: ${contextText}\n\n生徒: ${String(message).slice(0,1400)}`}
      ],
      temperature:0.25,
      max_tokens:360,
      stream:false
    })
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data?.error?.message||data?.message||"model error");
  return String(data?.choices?.[0]?.message?.content||"").trim();
}

export async function onRequestOptions(){
  return new Response(null,{status:204,headers:{
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type, X-Class-Code"
  }});
}

export async function onRequestPost(context){
  try{
    const key=env(context,"MAKERS_MODELS_KEY");
    const classCode=env(context,"CLASS_CODE");

    if(!key) return j({error:"MAKERS_MODELS_KEYが未設定です。"},500);

    if(classCode){
      const supplied=context.request.headers.get("X-Class-Code")||"";
      if(supplied!==String(classCode)) return j({error:"授業コードが違います。"},401);
    }

    const body=await context.request.json();
    const message=String(body?.message||"").trim();
    const ctx=body?.context||{};
    if(!message) return j({error:"質問が空です。"},400);

    // まず教材ロジック。基本指導はここで絶対に外さない。
    const fixed=localTeacher(message,ctx);
    if(fixed) return j(fixed);

    // 自由質問・考察評価のみ生成AI
    try{
      const text=await callModel(key,message,ctx,body?.history||[]);
      if(text) return j(response(text));
    }catch(e){
      console.error("Makers model error:",e);
    }

    // モデル失敗時も今の問題に合わせて返す
    if(ctx?.screen==="forceLab") return j(response(forceSpecific(ctx)));
    if(ctx?.screen==="pressureLab") return j(response(pressureSpecific(ctx)));
    if(ctx?.screen==="quiz") return j(response(quizSpecific(ctx)));
    return j(response("今の内容で、どこが引っかかったかを一言で教えて。そこだけ狙って説明するで。"));
  }catch(e){
    console.error(e);
    return j({error:"AI先生の通信でエラーが起きました。"},500);
  }
}

export default async function onRequest(context){
  if(context.request.method==="OPTIONS") return onRequestOptions(context);
  if(context.request.method==="POST") return onRequestPost(context);
  return j({error:"POSTで利用してください。"},405);
}
