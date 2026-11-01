#!/usr/bin/env node
import {McpServer, ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {pathToFileURL} from 'node:url';
import {SevClient, ApiError} from './client.mjs';

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value&&value.slice(0,4)!=='0000';
},'Use a real calendar date, YYYY-MM-DD.');
const discovery=z.object({
  question:z.string().trim().min(1).refine(s=>Array.from(s).length<=4000,'Maximum 4,000 characters.').describe('Natural-language SEC research question. Substantive alternatives and relationships matter.'),
  tickers:z.array(z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9.\-^/]{0,19}$/)).max(50).optional().describe('Explicit company universe. Alternative to sic_codes; never relaxed.'),
  sic_codes:z.array(z.string().regex(/^\d{4}$/)).max(50).optional().describe('Explicit four-digit industry codes, retaining leading zeroes. Alternative to tickers.'),
  filed_since:date.nullable().optional().describe('Inclusive SEC filing date. No hidden date default.'),
  max_companies:z.number().int().min(1).max(50).default(10),
}).strict();
const source=z.object({passage_id:z.string().regex(/^[A-Fa-f0-9]{32}$/)}).strict();
const text=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});

export function createServer(client=new SevClient()) {
  const server=new McpServer({name:'sev',version:'0.1.4'},{instructions:'SEV finds companies and original SEC passages worth investigating. Rankings indicate research relevance, not investment merit or proof of impact. Follow original sources. Do not automatically repeat a failed or uncertain discovery; it may already have used allowance. Use get_sec_passage for full text and adjacent context.'});
  const call=operation=>async(input,extra)=>{
    try{return text(await operation(input,extra.signal));}
    catch(error){const known=error instanceof ApiError;return {...text({status:'error',error:{code:known?error.code:'client_error',message:known?error.message:'The SEV client could not complete the request.'}}),isError:true};}
  };
  server.registerTool('discover_sec_companies',{
    title:'Discover SEC companies',description:"Find public companies and evidence in indexed SEC 10-K and 10-Q filings. Use for industry-wide discovery, named-company research or peer comparisons.\n\nReturns ranked research leads with 1-3 passage previews per company, filing metadata and source links, not a synthesized answer. Inspect relevant originals with get_sec_passage before making factual or numerical claims; previews can omit key evidence and qualifications.\n\nWhen available, discovery includes consolidated financial context. Check each figure's own period, source and availability. Numeric conditions may be checked for supported measures, periods and scope; unknown or absent verdicts mean unverified. Returned companies are not guaranteed numerical matches. Figures do not establish causation.\n\nCoverage is bounded: max_companies is a ceiling; missing companies and empty results do not prove absence of evidence. tickers OR sic_codes restrict the universe. filed_since filters filing dates, not report periods. Exact period references may restrict filings; inspect reporting_period notices for fallback.\n\nEach successful request, including a valid empty result, consumes one research allowance unit. Run discoveries sequentially per account; concurrent requests may return account_busy. Do not automatically retry failed or uncertain requests.",
    inputSchema:discovery,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:true},
  },call((input,signal)=>client.discover(input,signal)));
  server.registerTool('get_sec_passage',{
    title:'Read discovered SEC passage',description:"Read the full original SEC passage and available adjacent same-section context using a passage_id from discovery. Verify facts, amounts, dates, actual versus hypothetical disclosures, management explanations and qualifications before answering or citing. Context may omit referenced tables or other sections; do not infer missing facts or causation. No new discovery or model call; no research allowance unit consumed.",
    inputSchema:source,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true},
  },call((input,signal)=>client.passage(input.passage_id,signal)));
  server.registerResource('sec-passage',new ResourceTemplate('sev://passages/{passage_id}',{list:undefined}),{mimeType:'application/json'},
    async(uri,{passage_id},extra)=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(await client.passage(passage_id,extra.signal))}]}));
  return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await createServer().connect(new StdioServerTransport());}
  catch{process.stderr.write('SEV MCP could not start. Check Node version and SEV configuration.\n');process.exitCode=1;}
}
