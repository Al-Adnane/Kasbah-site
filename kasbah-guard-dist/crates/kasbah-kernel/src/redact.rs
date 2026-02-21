pub struct Finding {
    ftype: &'static str,
    category: &'static str,
    preview: String,
    confidence: f32,
    severity: &'static str,
}

pub fn redact_text(text: &str, findings: &Vec<Finding>) -> String {
    let mut out = text.to_string();

    // Redact by type (simple but real)
    for f in findings.iter() {
        match f.ftype {
            "private_key" => {
                // Replace full PEM block if present
                if let Some(a) = out.find("-----BEGIN") {
                    if let Some(rel) = out[a..].find("-----END") {
                        let b = a + rel;
                        // find end line terminator after END marker
                        let after_end = out[b..].find("-----").map(|x| b + x).unwrap_or(b);
                        // extend to end of line
                        let end_line = out[after_end..]
                            .find('\n')
                            .map(|x| after_end + x + 1)
                            .unwrap_or(out.len());
                        out.replace_range(a..end_line, "[REDACTED::PRIVATE_KEY]\n");
                    } else {
                        // fallback: blunt replace marker
                        out = out.replace("PRIVATE KEY-----", "[REDACTED::PRIVATE_KEY]");
                    }
                }
            }
            "jwt" => {
                // Replace Bearer token-like substrings
                out = out.replace("eyJ", "[REDACTED::JWT]eyJ");
            }
            "api_key" => {
                // Mask sk- prefix occurrences
                out = out.replace("sk-", "[REDACTED::API_KEY]sk-");
            }
            "mongodb_uri" => out = out.replace("mongodb://", "[REDACTED::MONGODB_URI]mongodb://"),
            "postgres_uri" => {
                out = out.replace("postgres://", "[REDACTED::POSTGRES_URI]postgres://")
            }
            "mysql_uri" => out = out.replace("mysql://", "[REDACTED::MYSQL_URI]mysql://"),
            "redis_uri" => out = out.replace("redis://", "[REDACTED::REDIS_URI]redis://"),
            "amqp_uri" => out = out.replace("amqp://", "[REDACTED::AMQP_URI]amqp://"),
            _ => {}
        }
    }

    out
}
