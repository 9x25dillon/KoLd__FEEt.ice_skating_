// Apache-2.0.
#include "KoLdProtocol.h"
#include <charconv>
#include <cmath>
#include <cfenv>
#include <limits>

#if defined(__FAST_MATH__) || defined(_M_FP_FAST)
#error "KoLd protocol requires strict floating point"
#endif

namespace KoLd { namespace Proto {
bool JsNumber(double x, std::string& out) {
  out.clear();
  if (!std::isfinite(x)) return false;
  if (x == 0) { out = "0"; return true; }
  if (x < 0) { out = "-"; x = -x; }
  char buffer[64];
  const auto r = std::to_chars(buffer, buffer + sizeof buffer, x, std::chars_format::scientific);
  if (r.ec != std::errc{}) return false;
  std::string digits;
  const char* p = buffer;
  while (p != r.ptr && *p != 'e') { if (*p != '.') digits += *p; ++p; }
  if (p == r.ptr || digits.empty()) return false;
  ++p; bool negative = false;
  if (p != r.ptr && (*p == '-' || *p == '+')) { negative = *p == '-'; ++p; }
  int exponent = 0;
  for (; p != r.ptr; ++p) exponent = exponent * 10 + (*p - '0');
  if (negative) exponent = -exponent;
  const int n = exponent + 1, k = static_cast<int>(digits.size());
  if (k <= n && n <= 21) { out += digits; out.append(n - k, '0'); }
  else if (n > 0 && n <= 21) { out += digits.substr(0, n) + '.' + digits.substr(n); }
  else if (n > -6 && n <= 0) { out += "0."; out.append(-n, '0'); out += digits; }
  else {
    out += digits[0];
    if (k > 1) out += '.' + digits.substr(1);
    out += exponent < 0 ? "e-" : "e+";
    out += std::to_string(exponent < 0 ? -exponent : exponent);
  }
  return true;
}

std::uint32_t Crc32(const std::string& bytes) {
  std::uint32_t c = 0xffffffffu;
  for (unsigned char b : bytes) {
    c ^= b;
    for (int i = 0; i < 8; ++i) c = (c & 1u) ? (c >> 1) ^ 0xedb88320u : c >> 1;
  }
  return c ^ 0xffffffffu;
}

bool StrictFpEnvironment() {
  if (std::fegetround() != FE_TONEAREST) return false;
  volatile double a = 1.0 + 0x1p-52, b = 1.0 - 0x1p-52, c = -1.0;
  const double ax = a, bx = b, cx = c;
  if (ax * bx + cx != 0) return false;
  volatile double tiny = std::numeric_limits<double>::denorm_min();
  volatile double two = 2.0;
  const double doubled = tiny * two;
  return doubled == 0x0.0000000000002p-1022;
}

std::string Pointer(const std::string& base, const std::string& key) {
  std::string out = base + '/';
  for (char c : key) { if (c == '~') out += "~0"; else if (c == '/') out += "~1"; else out += c; }
  return out;
}
bool CanonicalWriter::Fail(const std::string& message, const std::string& path) {
  if (error.empty()) { error = message; errorPath = path; }
  return false;
}
bool CanonicalWriter::Number(double value, const std::string& path, const std::string& key) {
  if (value == std::numeric_limits<double>::infinity() && key == "turnRadius") {
    bytes += "\"+Infinity\""; return true;
  }
  std::string number;
  if (!JsNumber(value, number)) return Fail("non-finite number or conversion failure", path);
  bytes += number; return true;
}
bool CanonicalWriter::String(const std::string& value, const std::string& path) {
  bytes += '"';
  for (unsigned char c : value) {
    if (c >= 0x80) return Fail("non-ASCII string outside pinned wire profile", path);
    switch (c) {
      case '"': bytes += "\\\""; break;
      case '\\': bytes += "\\\\"; break;
      case '\b': bytes += "\\b"; break;
      case '\f': bytes += "\\f"; break;
      case '\n': bytes += "\\n"; break;
      case '\r': bytes += "\\r"; break;
      case '\t': bytes += "\\t"; break;
      default:
        if (c < 32) { const char* hex = "0123456789abcdef"; bytes += "\\u00"; bytes += hex[c >> 4]; bytes += hex[c & 15]; }
        else bytes += static_cast<char>(c);
    }
  }
  bytes += '"'; return true;
}
bool CanonicalPair(const Wire::SkaterState& state, const std::vector<Wire::EdgeEvent>& events, CanonicalWriter& out) {
  out = {}; out.bytes = "[";
  if (!Write(out, state, "/0", "")) return false;
  out.bytes += ",[";
  for (std::size_t i = 0; i < events.size(); ++i) {
    if (i) out.bytes += ',';
    if (!Write(out, events[i], "/1/" + std::to_string(i), "")) return false;
  }
  out.bytes += "]]"; return true;
}
}}
