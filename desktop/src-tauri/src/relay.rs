//! Relais local pour le lecteur avancé : le navigateur intégré n'a pas le droit de lire les liens debrid (CORS) ;
//! ce petit serveur sur 127.0.0.1 les lit à sa place et ajoute les en-têtes qui manquent, comme le serveur de
//! streaming de Stremio. Il ne sert que Meow Watch : origine vérifiée et jeton aléatoire tiré à chaque lancement.
use std::io::Read;
use std::thread;
use tiny_http::{Header, Method, Response, Server, StatusCode};

pub struct Relay {
    pub port: u16,
    pub token: String,
}

fn header(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).expect("en-tête valide")
}

fn cors(origin: &str) -> Vec<Header> {
    vec![
        header("Access-Control-Allow-Origin", origin),
        header("Access-Control-Allow-Headers", "range"),
        header("Access-Control-Expose-Headers", "content-range, content-length, accept-ranges"),
        // Accès d'une page web à l'ordinateur local (Private Network Access de Chromium / WebView2)
        header("Access-Control-Allow-Private-Network", "true"),
        header("Vary", "Origin"),
    ]
}

fn query(url: &str, key: &str) -> Option<String> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| decode(v))
    })
}

fn decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => {
                match u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    Ok(v) => { out.push(v); i += 3; }
                    Err(_) => { out.push(b'%'); i += 1; }
                }
            }
            b'+' => { out.push(b' '); i += 1; }
            c => { out.push(c); i += 1; }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn token() -> String {
    let mut b = [0u8; 16];
    getrandom::getrandom(&mut b).expect("aléa du système");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Démarre le relais sur un port libre ; `origin` est la seule page autorisée (le site Meow Watch).
pub fn start(origin: &'static str) -> Relay {
    let server = Server::http("127.0.0.1:0").expect("relais local");
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    let tok = token();
    let expected = tok.clone();
    thread::spawn(move || {
        let agent = ureq::AgentBuilder::new().redirects(8).build();
        for req in server.incoming_requests() {
            let agent = agent.clone();
            let expected = expected.clone();
            thread::spawn(move || handle(req, &agent, origin, &expected));
        }
    });
    Relay { port, token: tok }
}

fn handle(req: tiny_http::Request, agent: &ureq::Agent, origin: &str, expected: &str) {
    let from = req.headers().iter().find(|h| h.field.equiv("Origin")).map(|h| h.value.as_str().to_string());
    if from.as_deref().is_some_and(|o| o != origin) {
        let _ = req.respond(Response::empty(StatusCode(403)));
        return;
    }
    if *req.method() == Method::Options {
        let mut r = Response::empty(StatusCode(204));
        for h in cors(origin) { r.add_header(h); }
        let _ = req.respond(r);
        return;
    }
    let url = req.url().to_string();
    let target = query(&url, "u").unwrap_or_default();
    if query(&url, "t").as_deref() != Some(expected) || !(target.starts_with("https://") || target.starts_with("http://")) {
        let _ = req.respond(Response::empty(StatusCode(403)));
        return;
    }
    let range = req.headers().iter().find(|h| h.field.equiv("Range")).map(|h| h.value.as_str().to_string());
    let mut up = agent.get(&target);
    if let Some(r) = &range { up = up.set("Range", r); }
    let res = match up.call() {
        Ok(r) => r,
        Err(ureq::Error::Status(code, r)) if code < 500 => r,
        Err(_) => { let _ = req.respond(Response::empty(StatusCode(502))); return; }
    };
    let status = res.status();
    let mut headers = cors(origin);
    for k in ["Content-Type", "Content-Range", "Accept-Ranges"] {
        if let Some(v) = res.header(k) { headers.push(header(k, v)); }
    }
    let len = res.header("Content-Length").and_then(|v| v.parse::<usize>().ok());
    let body: Box<dyn Read + Send> = res.into_reader();
    let _ = req.respond(Response::new(StatusCode(status), headers, body, len, None));
}

#[cfg(test)]
mod tests {
    use super::*;

    const SITE: &str = "https://meowwatch.vkzdev.com";

    /// Faux serveur debrid : 1000 octets, accepte Range, sans CORS.
    fn upstream() -> u16 {
        let s = Server::http("127.0.0.1:0").unwrap();
        let port = s.server_addr().to_ip().unwrap().port();
        thread::spawn(move || {
            let data: Vec<u8> = (0..1000u32).map(|i| (i % 251) as u8).collect();
            for req in s.incoming_requests() {
                let range = req.headers().iter().find(|h| h.field.equiv("Range")).map(|h| h.value.as_str().to_string());
                match range.and_then(|r| r.strip_prefix("bytes=").map(str::to_string)) {
                    Some(r) => {
                        let (a, b) = r.split_once('-').unwrap();
                        let a: usize = a.parse().unwrap();
                        let b: usize = b.parse().unwrap_or(999).min(999);
                        let mut res = Response::from_data(data[a..=b].to_vec()).with_status_code(206);
                        res.add_header(header("Content-Range", &format!("bytes {a}-{b}/1000")));
                        res.add_header(header("Accept-Ranges", "bytes"));
                        let _ = req.respond(res);
                    }
                    None => { let _ = req.respond(Response::from_data(data.clone())); }
                }
            }
        });
        port
    }

    #[test]
    fn relaie_avec_range_et_cors() {
        let up = upstream();
        let relay = start(SITE);
        let link = format!("http://127.0.0.1:{up}/film.mkv");
        let url = format!("http://127.0.0.1:{}/?t={}&u={}", relay.port, relay.token, link.replace(':', "%3A").replace('/', "%2F"));
        let res = ureq::get(&url).set("Origin", SITE).set("Range", "bytes=10-19").call().unwrap();
        assert_eq!(res.status(), 206);
        assert_eq!(res.header("Access-Control-Allow-Origin"), Some(SITE));
        assert_eq!(res.header("Content-Range"), Some("bytes 10-19/1000"));
        let mut body = Vec::new();
        res.into_reader().read_to_end(&mut body).unwrap();
        assert_eq!(body, (10..20u32).map(|i| (i % 251) as u8).collect::<Vec<_>>());
        // Pré-vérification CORS du navigateur
        let pre = ureq::request("OPTIONS", &url).set("Origin", SITE).call().unwrap();
        assert_eq!(pre.status(), 204);
        assert_eq!(pre.header("Access-Control-Allow-Private-Network"), Some("true"));
    }

    #[test]
    fn refuse_les_autres() {
        let relay = start(SITE);
        let base = format!("http://127.0.0.1:{}", relay.port);
        let code = |r: Result<ureq::Response, ureq::Error>| match r { Ok(r) => r.status(), Err(ureq::Error::Status(c, _)) => c, Err(e) => panic!("{e}") };
        // mauvais jeton
        assert_eq!(code(ureq::get(&format!("{base}/?t=faux&u=https%3A%2F%2Fx.dev%2Fa")).call()), 403);
        // autre site
        assert_eq!(code(ureq::get(&format!("{base}/?t={}&u=https%3A%2F%2Fx.dev%2Fa", relay.token)).set("Origin", "https://pirate.example").call()), 403);
        // pas un lien web
        assert_eq!(code(ureq::get(&format!("{base}/?t={}&u=file%3A%2F%2F%2Fetc%2Fpasswd", relay.token)).call()), 403);
    }

    #[test]
    fn decode_les_parametres() {
        assert_eq!(decode("https%3A%2F%2Fa.b%2Fc%20d.mkv"), "https://a.b/c d.mkv");
        assert_eq!(query("/?t=abc&u=x%2Fy", "u").as_deref(), Some("x/y"));
        assert_eq!(decode("100%"), "100%");
    }
}
