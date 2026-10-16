#!/usr/bin/env python3
"""score.py - @Heroes0fcrypto measurement. Stdlib only. Never posts anything.

Usage:
  python3 score.py ingest PULL.json [--dir .]     # update posts.csv / followers.csv from an X API pull
  python3 score.py scorecard [--dir .] [--week-ending YYYY-MM-DD]   # print weekly markdown

Expected PULL.json shape (save the raw x MCP responses into one file):
{
  "pulled_at": "2026-10-16T16:37:00Z",          # ISO UTC, when the pull ran
  "user":  <get_users_by_username response, user.fields=public_metrics>   # {"data":{...,"public_metrics":{...}}}
  "posts": <get_users_posts response, post.fields=public_metrics,created_at,referenced_tweets>  # {"data":[...]}
  "test": false                                  # true marks fixture data; rows get notes=TEST
}
"posts" may also be a plain list of post objects. Each post needs id, created_at,
public_metrics{impression_count,like_count,reply_count,retweet_count,quote_count}.
Our own self-replies (in_reply_to_user_id == our id) are the link replies under a post; they are skipped.

Snapshot rule: a post's 24h columns are written when age at pull is 20-48h;
its 7d columns when age is 6-10 days. Later pulls in the same window overwrite
(closest-to-target wins). Hand-filled columns (format_tag, slot, hypothesis,
tactics_replies, token_replies, notes) are never overwritten.
"""
import csv, json, sys, os, argparse
from datetime import datetime, timedelta, timezone

PT = timezone(timedelta(hours=-7))  # PDT; Nov-Mar use -8 (adjust or set TZ_OFFSET env)
if os.environ.get("TZ_OFFSET"):
    PT = timezone(timedelta(hours=int(os.environ["TZ_OFFSET"])))

POST_COLS = ["id","url","posted_at_pt","format_tag","slot","hypothesis",
 "views_24h","likes_24h","replies_24h","reposts_24h","quotes_24h","er_24h","age_h_24h",
 "views_7d","likes_7d","replies_7d","reposts_7d","quotes_7d","er_7d","age_h_7d",
 "tactics_replies","token_replies","notes"]
OUT_COLS = ["target_url","target_account","drafted_at","posted","our_reply_url",
 "views","likes","replies","profile_effect","checked_at","notes"]
FOL_COLS = ["pulled_at_pt","followers","following","tweet_count","listed","notes"]

def ts(s): return datetime.fromisoformat(s.replace("Z","+00:00"))
def slot_of(dt):
    h = dt.astimezone(PT).hour
    return "morning" if 5<=h<11 else "midday" if 11<=h<15 else "afternoon" if 15<=h<19 else "evening" if 19<=h<24 else "night"
def read(path, cols):
    if not os.path.exists(path): return []
    with open(path, newline="") as f: return list(csv.DictReader(f))
def write(path, cols, rows):
    with open(path,"w",newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore"); w.writeheader(); w.writerows(rows)
def er(m):
    v = m.get("impression_count",0)
    return round((m.get("like_count",0)+m.get("reply_count",0)+m.get("retweet_count",0)+m.get("quote_count",0))/v,4) if v else ""

def ingest(pull, d):
    now = ts(pull["pulled_at"]); test = pull.get("test", False)
    u = pull.get("user",{}); u = u.get("data",u); uid = u.get("id")
    posts = pull.get("posts",[]); posts = posts.get("data",[]) if isinstance(posts,dict) else posts
    pp = os.path.join(d,"posts.csv"); rows = read(pp,POST_COLS); byid = {r["id"]:r for r in rows}
    n=0
    for p in posts:
        if uid and p.get("in_reply_to_user_id")==uid: continue
        if any(r.get("type")=="retweeted" for r in p.get("referenced_tweets",[]) or []): continue
        c = ts(p["created_at"]); age = (now-c).total_seconds()/3600; m = p["public_metrics"]
        r = byid.get(p["id"])
        if not r:
            r = {k:"" for k in POST_COLS}; r.update(id=p["id"], url=p.get("url") or f"https://x.com/i/status/{p['id']}",
                 posted_at_pt=c.astimezone(PT).strftime("%Y-%m-%d %H:%M"), slot=slot_of(c), notes="TEST" if test else "")
            rows.append(r); byid[p["id"]]=r
        for w,lo,hi,tgt in (("24h",20,48,24),("7d",144,240,168)):
            if lo<=age<=hi:
                prev = r.get(f"age_h_{w}")
                if prev and abs(float(prev)-tgt) < abs(age-tgt): continue
                r.update({f"views_{w}":m.get("impression_count",0), f"likes_{w}":m.get("like_count",0),
                  f"replies_{w}":m.get("reply_count",0), f"reposts_{w}":m.get("retweet_count",0),
                  f"quotes_{w}":m.get("quote_count",0), f"er_{w}":er(m), f"age_h_{w}":round(age,1)}); n+=1
    rows.sort(key=lambda r:r["posted_at_pt"]); write(pp,POST_COLS,rows)
    if u.get("public_metrics"):
        fp=os.path.join(d,"followers.csv"); fr=read(fp,FOL_COLS); pm=u["public_metrics"]
        fr.append(dict(pulled_at_pt=now.astimezone(PT).strftime("%Y-%m-%d %H:%M"), followers=pm.get("followers_count"),
          following=pm.get("following_count"), tweet_count=pm.get("tweet_count"), listed=pm.get("listed_count"), notes="TEST" if test else ""))
        write(fp,FOL_COLS,fr)
    if not os.path.exists(os.path.join(d,"outreach.csv")): write(os.path.join(d,"outreach.csv"),OUT_COLS,[])
    print(f"ingested {len(posts)} posts, {n} snapshot cells written")

def num(x):
    try: return float(x)
    except: return None
def agg(rows):
    def s(k): return sum(num(r[k]) or 0 for r in rows)
    v=s("views_24h"); e=s("likes_24h")+s("replies_24h")+s("reposts_24h")+s("quotes_24h")
    return dict(posts=len(rows), views=v, eng=e, er=(e/v if v else None), replies=s("replies_24h"),
                tactics=s("tactics_replies"), token=s("token_replies"))
def fmt(x,pct=False):
    if x is None: return "n/a"
    return f"{x*100:.1f}%" if pct else (f"{x:.0f}" if float(x).is_integer() else f"{x:.2f}")
def delta(a,b,pct=False):
    if a is None or b is None: return "n/a"
    d=a-b; return (f"{d*100:+.1f} pts" if pct else f"{d:+.0f}")
def scorecard(d, end):
    end = datetime.strptime(end,"%Y-%m-%d").date() if end else datetime.now(PT).date()
    rows=[r for r in read(os.path.join(d,"posts.csv"),POST_COLS) if r["views_24h"]!=""]
    day=lambda r: datetime.strptime(r["posted_at_pt"][:10],"%Y-%m-%d").date()
    cur=[r for r in rows if end-timedelta(6)<=day(r)<=end]; prv=[r for r in rows if end-timedelta(13)<=day(r)<=end-timedelta(7)]
    a,b=agg(cur),agg(prv)
    fr=read(os.path.join(d,"followers.csv"),FOL_COLS)
    def fol_at(dt):
        c=[f for f in fr if datetime.strptime(f["pulled_at_pt"][:10],"%Y-%m-%d").date()<=dt]; return num(c[-1]["followers"]) if c else None
    f1,f0,fm=fol_at(end),fol_at(end-timedelta(7)),fol_at(end-timedelta(14))
    o=[r for r in read(os.path.join(d,"outreach.csv"),OUT_COLS) if r["posted"].lower()=="y"
       and r["drafted_at"][:10] and end-timedelta(6)<=datetime.strptime(r["drafted_at"][:10],"%Y-%m-%d").date()<=end]
    L=[f"# Weekly scorecard, week ending {end} (PT)","",
       "Source: public X API metrics at the 24h snapshot. Profile visits and link clicks: not visible.","",
       "| Metric | This week | Last week | WoW |","|---|---|---|---|"]
    for name,k,p in (("Posts scored","posts",0),("Views (24h)","views",0),("Engagements (24h)","eng",0),
                     ("Engagement rate","er",1),("Replies received","replies",0),("Tactics-player replies (north star)","tactics",0),("Token-crowd replies","token",0)):
        L.append(f"| {name} | {fmt(a[k],p)} | {fmt(b[k],p)} | {delta(a[k],b[k],p)} |")
    L.append(f"| Followers (end of week) | {fmt(f1)} | {fmt(f0)} | {delta(f1,f0)} |")
    L.append(f"| Outreach replies posted | {len(o)} | | |")
    if o: L.append(f"| Outreach views / likes | {fmt(sum(num(r['views']) or 0 for r in o))} / {fmt(sum(num(r['likes']) or 0 for r in o))} | | |")
    for label,key in (("format","format_tag"),("slot","slot")):
        g={}
        for r in cur: g.setdefault(r[key] or "untagged",[]).append(r)
        st=sorted(((k,agg(v)) for k,v in g.items()), key=lambda kv:(kv[1]["tactics"], kv[1]["er"] or 0), reverse=True)
        L+=["",f"## By {label} (ranked by tactics replies, then ER)","",f"| {label} | posts | views | ER | tactics replies |","|---|---|---|---|---|"]
        L+=[f"| {k} | {x['posts']} | {fmt(x['views'])} | {fmt(x['er'],1)} | {fmt(x['tactics'])} |" for k,x in st]
        if st:
            L.append(f"\nBest {label}: **{st[0][0]}**." + (f" Worst: **{st[-1][0]}**." if len(st)>1 else " Only one, no comparison yet."))
    if not cur: L+=["","No scored posts this week."]
    print("\n".join(L))

if __name__=="__main__":
    ap=argparse.ArgumentParser(); ap.add_argument("cmd",choices=["ingest","scorecard"]); ap.add_argument("file",nargs="?")
    ap.add_argument("--dir",default="."); ap.add_argument("--week-ending")
    a=ap.parse_args()
    if a.cmd=="ingest": ingest(json.load(open(a.file)),a.dir)
    else: scorecard(a.dir,a.week_ending)
