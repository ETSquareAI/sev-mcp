/** HTTP-only bridge. No Oracle credentials, models, automatic retries or disk state. */
export class ApiError extends Error {
  constructor(code, message, status=0) {super(message);this.code=code;this.status=status;}
}

// Never forward provider/backend error text or unknown error codes to MCP callers.
const PUBLIC_ERRORS = Object.freeze({
  invalid_request:'Check the question, filters and requested result count.',
  invalid_passage_id:'Use an original passage_id returned by SEV discovery.',
  passage_not_found:'The original SEC passage is unavailable. Check the passage_id returned by discovery.',
  unresolved_filter:'An explicit company or industry filter could not be resolved. Check the supplied filters.',
  ambiguous_ticker:'An explicit ticker is ambiguous. Check the company filter.',
  request_too_large:'The request is too large. Shorten the question or filters.',
  authentication_required:'Configure your SEV API key to access this operation.',
  authentication_failed:'Check that your SEV API key is valid and has not been revoked.',
  insufficient_scope:'Your authorization does not permit this operation. Check your SEV connection.',
  account_unavailable:'This SEV account is unavailable. Check your account at https://etsquare.ai/account.',
  email_verification_required:'Verify your email address in your SEV account before continuing.',
  rate_limited:'The request rate limit was reached. Try again shortly; no automatic retry was made.',
  account_busy:'Your account already has research requests running. Wait for them to finish.',
  service_busy:'SEV is busy. Try again later; no automatic retry was made.',
  request_timeout:'SEV did not complete the request in time. No automatic retry was made; submitted work may still complete.',
  quota_exhausted:'Your research allowance is exhausted. Check your SEV account allowance. Source passage retrieval does not consume a research request.',
  anonymous_allowance_exhausted:'Your public trial allowance is exhausted. Sign in to SEV for account access.',
  anonymous_capacity_reached:'Public trial capacity is exhausted for today. Sign in to SEV for account access.',
  agreement_required:'Review and accept the current SEV terms in your account before continuing.',
  legal_setup_pending:'SEV account setup is not ready. Try again later.',
  subscription_inactive:'Your account entitlement is inactive. Check your SEV account.',
  invalid_idempotency_key:'The request identifier is invalid. Check the client request identifier.',
  idempotency_conflict:'This request identifier was used for different research. No additional discovery was started.',
  request_already_recorded:'This request is already recorded. No additional discovery was started.',
  origin_not_allowed:'The request origin is not permitted. Check your SEV connection configuration.',
  interactive_signin_required:'Sign in to your SEV account to perform this operation.',
  service_unavailable:'SEV is temporarily unavailable. Please try again later.',
});
function publicFailure(value, status, request) {
  const supplied=value?.error?.code;
  const fallback=status===401?'authentication_required':status===403?'insufficient_scope':
    status===504?'request_timeout':status===429?'rate_limited':status===413?'request_too_large':
    (status===400||status===422)?'invalid_request':'service_unavailable';
  const code=typeof supplied==='string'&&Object.hasOwn(PUBLIC_ERRORS,supplied)?supplied:fallback;
  let message=PUBLIC_ERRORS[code];
  if(request&&(code==='unresolved_filter'||code==='ambiguous_ticker')) {
    const details=value?.error?.invalid_filters;
    const legacy=value?.error?.message;
    let candidates=[];
    // Legacy backend compatibility: only identifiers from known fixed formats.
    if(typeof legacy==='string'&&legacy.length<=2048) {
      const prefix='Explicit universe values were not found in the primary company catalog: ';
      if(code==='unresolved_filter'&&legacy.startsWith(prefix))candidates=legacy.slice(prefix.length).split(', ');
      if(code==='ambiguous_ticker') {
        const match=legacy.match(/^Ticker ([A-Z0-9][A-Z0-9.\-^/]{0,19}) does not resolve to one CIK\.$/);
        if(match)candidates=[match[1]];
      }
    }
    const identified=[];
    for(const [field,pattern] of [['tickers',/^[A-Z0-9][A-Z0-9.\-^/]{0,19}$/],['sic_codes',/^[0-9]{4}$/]]) {
      if(code==='ambiguous_ticker'&&field!=='tickers')continue;
      const supplied=Array.isArray(request[field])?request[field].slice(0,50):[];
      const reported=Array.isArray(details?.[field])?details[field].slice(0,50):candidates;
      const values=[...new Set(supplied.filter(v=>typeof v==='string').map(v=>v.trim().toUpperCase())
        .filter(v=>pattern.test(v)&&reported.includes(v)))];
      if(values.length)identified.push(field+': '+values.join(', '));
    }
    if(identified.length)message+=' Check '+identified.join('; ')+'.';
  }
  return new ApiError(code,message,status);
}

export class SevClient {
  #passageTail=Promise.resolve();
  constructor({baseURL=process.env.SEV_BASE_URL||'https://etsquare.ai', apiKey=process.env.SEV_API_KEY,
               termsVersion=process.env.SEV_ACCEPT_TERMS_VERSION, fetchImpl=globalThis.fetch, timeout=30000}={}) {
    const url=new URL(baseURL);
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if ((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash||url.pathname!=='/')
      throw new Error('SEV_BASE_URL must be an HTTPS origin, or an HTTP loopback origin for development.');
    if(apiKey&&!/^sev_[A-Za-z0-9_-]{43}$/.test(apiKey))throw new Error('SEV_API_KEY is not a valid SEV key.');
    if(termsVersion&&!/^[A-Za-z0-9._-]{1,60}$/.test(termsVersion))throw new Error('Invalid reviewed Terms version.');
    if(!Number.isInteger(timeout)||timeout<1||timeout>60000)throw new Error('Invalid request timeout.');
    this.base=url.origin;this.apiKey=apiKey;this.termsVersion=termsVersion;this.fetch=fetchImpl;this.timeout=timeout;this.cookie='';
  }
  async request(path, body, signal) {
    const headers={'Accept':'application/json','X-SEV-Client':'mcp'};
    if(this.apiKey)headers.Authorization='Bearer '+this.apiKey;
    else if(this.cookie)headers.Cookie=this.cookie;
    if(body!==undefined)headers['Content-Type']='application/json';
    if(!this.apiKey&&path==='/v1/sec/discover-companies'&&this.termsVersion)headers['X-SEV-Terms-Version']=this.termsVersion;
    let response;
    try {
      response=await this.fetch(this.base+path,{method:body===undefined?'GET':'POST',headers,redirect:'error',
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:signal?AbortSignal.any([signal,AbortSignal.timeout(this.timeout)]):AbortSignal.timeout(this.timeout)});
      if(!this.apiKey){const cookie=response.headers.get('set-cookie')?.match(/(?:^|,\s*)__session=([A-Za-z0-9_.-]+);/);if(cookie)this.cookie='__session='+cookie[1];}
      const declared=Number(response.headers.get('content-length')||0);
      if(declared>4194304)throw new ApiError('invalid_response','The SEV response exceeded the supported size.');
      const reader=response.body?.getReader();let size=0;const parts=[];
      if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4194304)throw new ApiError('invalid_response','The SEV response exceeded the supported size.');parts.push(value);}}finally{await reader.cancel();}}
      const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
      let result;try{result=JSON.parse(new TextDecoder().decode(bytes));}catch{
        if(!response.ok)throw publicFailure(null,response.status,body);
        throw new ApiError('invalid_response','SEV returned an invalid JSON response. No automatic retry was made.');
      }
      if(!response.ok||result?.status==='error')throw publicFailure(result,response.status,body);
      if(!result||typeof result!=='object'||Array.isArray(result))throw new ApiError('invalid_response','SEV returned an invalid response. No automatic retry was made.');
      return result;
    } catch(error) {
      if(error instanceof ApiError)throw error;
      if(signal?.aborted)throw new ApiError('request_cancelled','Stopped waiting. Work already submitted may continue on the server.');
      throw new ApiError('service_unreachable','SEV could not be reached or the response timed out. No automatic retry was made.');
    }
  }
  async discover(input,signal){
    if(input.tickers?.length&&input.sic_codes?.length)throw new ApiError('invalid_request','Use tickers or SIC codes, not both.',422);
    const result=await this.request('/v1/sec/discover-companies',input,signal);
    if(result.status!=='ok'||!Array.isArray(result.companies)||typeof result.question!=='string')
      throw new ApiError('invalid_response','SEV returned an invalid discovery response.');
    return result;
  }
  async passage(id,signal){
    if(!/^[a-f0-9]{32}$/i.test(id))throw new ApiError('invalid_passage_id','Use the passage_id returned by discovery.',400);
    const cancelled=()=>new ApiError('request_cancelled','Stopped waiting. Work already submitted may continue on the server.');
    if(signal?.aborted)throw cancelled();
    let onAbort;
    const cancellation=signal?new Promise((_,reject)=>{
      onAbort=()=>reject(cancelled());signal.addEventListener('abort',onAbort,{once:true});
    }):null;
    const run=this.#passageTail.then(async()=>{
      // Once sent, request() owns cancellation and starts its existing timeout.
      if(onAbort)signal.removeEventListener('abort',onAbort);
      if(signal?.aborted)throw cancelled();
      const result=await this.request('/v1/sec/passages/'+encodeURIComponent(id),undefined,signal);
      if(typeof result.passage_id!=='string'||result.passage_id.toUpperCase()!==id.toUpperCase()||typeof result.text!=='string'||!Array.isArray(result.adjacent_passages))
        throw new ApiError('invalid_response','SEV returned an invalid source response.');
      return result;
    });
    // Absorb failure only on the queue tail; each caller still gets its own error.
    this.#passageTail=run.then(()=>undefined,()=>undefined);
    try{return await (cancellation?Promise.race([run,cancellation]):run);}
    finally{if(onAbort)signal.removeEventListener('abort',onAbort);}
  }
}
