import React from "react";
import {AbsoluteFill, Img, Sequence, useCurrentFrame, interpolate, staticFile} from "remotion";
import type {CompositionProps} from "./Root";
import {buildTimeline, visibleWordCount, BODY_DURATION_SECONDS, FPS} from "./timeline";

const SceneView: React.FC<{title:string;body:string;accent:string;foreground:string}> = ({title,body,accent,foreground}) => {
  const frame = useCurrentFrame();
  const words = body.split(/\s+/u).filter(Boolean);
  const visible = visibleWordCount(frame, words.length);
  const wipe = interpolate(frame,[0,12],[100,0],{extrapolateRight:"clamp"});
  const wipeOpacity = interpolate(frame,[0,12],[0.12,0],{extrapolateRight:"clamp"});
  return <AbsoluteFill style={{justifyContent:"center",alignItems:"center",padding:"150px 100px",background:"transparent",color:foreground}}>
    <div style={{position:"absolute",inset:0,background:accent,clipPath:`inset(0 ${wipe}% 0 0)`,opacity:wipeOpacity}} />
    <div dir="auto" style={{fontSize:76,fontWeight:800,textAlign:"center",marginBottom:90,position:"relative",unicodeBidi:"plaintext"}}>{title}</div>
    <div dir="auto" style={{fontSize:64,lineHeight:1.7,fontWeight:600,textAlign:"center",position:"relative",unicodeBidi:"plaintext",maxWidth:880}}>
      {words.slice(0,visible).join(" ")}
    </div>
  </AbsoluteFill>;
};

export const Reel: React.FC<CompositionProps> = ({input,brand,logoSrc}) => {
  const frame = useCurrentFrame();
  const timeline = input ? buildTimeline(input) : [];
  const seconds = frame / FPS;
  const endingVisible = seconds >= BODY_DURATION_SECONDS;
  const localCharacters = Array.from(brand.brand_name_local);
  const visibleLocalName = localCharacters.slice(0, Math.max(0, Math.min(localCharacters.length, Math.floor((seconds - 42.2) / 0.12) + 1))).join("");
  return <AbsoluteFill style={{backgroundColor:brand.colors.bg,fontFamily:brand.font,color:brand.colors.text,overflow:"hidden"}}>
    {input && timeline.map(scene => (
      <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.endFrame-scene.startFrame}>
        <SceneView title={scene.title} body={scene.body} accent={brand.colors.accent1} foreground={brand.colors.text}/>
      </Sequence>
    ))}
    {endingVisible && <AbsoluteFill style={{alignItems:"center",textAlign:"center"}}>
      <Img src={logoSrc || staticFile("brand-logo.svg")} style={{position:"absolute",left:360,top:520,width:360,height:360,objectFit:"contain"}} />
      {seconds>=42.2 && <div style={{position:"absolute",top:1000,left:0,right:0,fontSize:92,fontWeight:800}}>{visibleLocalName}</div>}
      {seconds>=43.8 && <div style={{position:"absolute",top:1180,left:0,right:0,fontSize:92,fontWeight:800,color:brand.colors.accent1}} dir="ltr">{brand.brand_name}</div>}
      {seconds>=44.8 && <div style={{position:"absolute",top:1360,left:0,right:0,fontSize:64,fontWeight:700}} dir="ltr">{brand.slogan}</div>}
    </AbsoluteFill>}
  </AbsoluteFill>;
};
