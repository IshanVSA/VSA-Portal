import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MousePointerClick, Copy, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  clinicId: string;
}

export function CtaTrackingSetupCard({ clinicId }: Props) {
  const [copied, setCopied] = useState(false);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const endpoint = `${supabaseUrl}/functions/v1/track-event`;

  const snippet = `<script>
window.VSA_TRACKING = {
  clinicId: "${clinicId}",
  endpoint: "${endpoint}"
};
</script>
<script>
(function(){"use strict";var C=window.VSA_TRACKING||{},CLINIC=C.clinicId||"UNSET",
EP=C.endpoint,CTAS=["book_appointment","find_us","call_us","new_client_form","email_contact"],SK="vsa_session";
function uuid(){return"10000000-1000-4000-8000-100000000000".replace(/[018]/g,function(c){return(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)})}
function p(n){return new URLSearchParams(location.search).get(n)}
function chan(){var r=document.referrer||"",h="";try{h=r?new URL(r).hostname.toLowerCase():""}catch(e){}
var m=(p("utm_medium")||"").toLowerCase(),s=(p("utm_source")||"").toLowerCase(),paid=p("gclid")||p("gbraid")||p("wbraid");
if(paid||/(^|\\b)(cpc|ppc|paid|paidsearch)(\\b|$)/.test(m))return{channel:"paid",source:s||"google"};
if(m==="organic")return{channel:"organic",source:s||h||"search"};
var eng=["google.","bing.","yahoo.","duckduckgo.","ecosia.","brave."],soc=["facebook.","instagram.","linkedin.","t.co","twitter.","x.com","youtube.","tiktok.","pinterest."];
if(p("fbclid")||soc.some(function(x){return h.indexOf(x)!==-1}))return{channel:"social",source:s||h||"social"};
if(eng.some(function(x){return h.indexOf(x)!==-1}))return{channel:"organic",source:h.split(".")[0]||"search"};
if(m==="email"||s==="email")return{channel:"email",source:s||"email"};
if(m==="referral"||(h&&h!==location.hostname))return{channel:"referral",source:s||h};
return{channel:"direct",source:"(direct)"}}
function getS(){var raw;try{raw=sessionStorage.getItem(SK)}catch(e){}if(raw){try{return JSON.parse(raw)}catch(e){}}
var c=chan(),o={id:uuid(),channel:c.channel,source:c.source,landing_page:location.pathname+location.search,isNew:true};
try{sessionStorage.setItem(SK,JSON.stringify(o))}catch(e){}return o}
var S=getS();
function send(d){d.clinic_id=CLINIC;d.session_id=S.id;d.channel=S.channel;d.source=S.source;d.page_path=location.pathname;
var b=JSON.stringify(d);if(navigator.sendBeacon){navigator.sendBeacon(EP,new Blob([b],{type:"application/json"}))}
else{fetch(EP,{method:"POST",headers:{"Content-Type":"application/json"},body:b,keepalive:true})}}
if(S.isNew){send({event_type:"session_start",landing_page:S.landing_page});S.isNew=false;try{sessionStorage.setItem(SK,JSON.stringify(S))}catch(e){}}
function res(el){var n=el;while(n&&n!==document.body){if(n.dataset&&n.dataset.cta)return n.dataset.cta;
if(n.tagName==="A"&&n.href){var hh=n.href.toLowerCase();if(hh.indexOf("tel:")===0)return"call_us";if(hh.indexOf("mailto:")===0)return"email_contact"}n=n.parentNode}return null}
function ga(c){try{if(typeof window.gtag==="function"){window.gtag("event",c,{cta_type:c,channel:S.channel,source:S.source,page_path:location.pathname})}else{(window.dataLayer=window.dataLayer||[]).push({event:c,cta_type:c,channel:S.channel,source:S.source,page_path:location.pathname})}}catch(e){}}
document.addEventListener("click",function(e){var c=res(e.target);if(c&&CTAS.indexOf(c)!==-1){send({event_type:"cta_click",cta_type:c});ga(c)}},true)})();
</script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("CTA tracking snippet copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MousePointerClick className="h-4 w-4" />
          CTA Tracking Setup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            Paste this snippet before the closing <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;/body&gt;</code> tag
            on the clinic's website (or add it as a Custom HTML tag in Google Tag Manager firing on All Pages).
          </p>
          <p>
            Then add a <code className="text-xs bg-muted px-1 py-0.5 rounded">data-cta</code> attribute to each CTA button:{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">data-cta="book_appointment"</code>,{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">"find_us"</code>,{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">"call_us"</code>,{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">"new_client_form"</code>,{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">"email_contact"</code>.{" "}
            <span className="text-xs">(<code>tel:</code> and <code>mailto:</code> links auto-detect.)</span>
          </p>
        </div>

        <div className="relative">
          <pre className="bg-muted rounded-lg p-3 text-[11px] font-mono overflow-x-auto whitespace-pre max-h-72 text-foreground">
            {snippet}
          </pre>
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-1.5 right-1.5 bg-background/80 backdrop-blur-sm"
            onClick={handleCopy}
          >
            {copied ? <CheckCircle className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
