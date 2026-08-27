function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
  });
}
export default function onRequest(context){
  const requiresCode=Boolean(context?.env?.CLASS_CODE);
  return json({ok:true,requiresCode});
}
