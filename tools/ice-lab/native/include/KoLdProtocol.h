// Apache-2.0. Engine-independent UE-REPLAY-01 serialization foundation.
#pragma once
#include <array>
#include <cstdint>
#include <string>
#include <vector>
#include "KoLdWireTypes.h"

namespace KoLd { namespace Proto {
bool JsNumber(double value, std::string& out);
std::uint32_t Crc32(const std::string& bytes);
bool StrictFpEnvironment();

// ASCII is the complete string/key domain of the pinned wire interfaces.
// This writer is not a general JSON reader or a replay importer.
class CanonicalWriter {
public:
  std::string bytes, error, errorPath;
  bool Number(double value, const std::string& path, const std::string& key);
  bool String(const std::string& value, const std::string& path);
  bool Fail(const std::string& message, const std::string& path);
};
std::string Pointer(const std::string& base, const std::string& key);

inline bool Write(CanonicalWriter& w, double v, const std::string& p, const std::string& k) {
  return w.Number(v, p, k);
}
inline bool Write(CanonicalWriter& w, bool v, const std::string&, const std::string&) {
  w.bytes += v ? "true" : "false"; return true;
}
template<class T> bool Write(CanonicalWriter&, const T&, const std::string&, const std::string&);
template<class T, std::size_t N>
bool Write(CanonicalWriter& w, const std::array<T, N>& v, const std::string& p, const std::string&) {
  w.bytes += '[';
  for (std::size_t i = 0; i < N; ++i) {
    if (i) w.bytes += ',';
    if (!Write(w, v[i], Pointer(p, std::to_string(i)), "")) return false;
  }
  w.bytes += ']'; return true;
}
template<class T>
bool Write(CanonicalWriter& w, const T& v, const std::string& p, const std::string&) {
  w.bytes += '{'; bool first = true, ok = true;
  Wire::Fields(v, [&](const char* key, const auto& field) {
    if (!ok) return;
    if (!first) w.bytes += ',';
    first = false;
    if (!w.String(key, p)) { ok = false; return; }
    w.bytes += ':';
    ok = Write(w, field, Pointer(p, key), key);
  });
  if (ok) w.bytes += '}';
  return ok;
}

bool CanonicalPair(const Wire::SkaterState& state, const std::vector<Wire::EdgeEvent>& events,
                   CanonicalWriter& out);

// A capability declaration, never an implementation or a successful verification.
inline constexpr bool KernelAvailable = false;
inline constexpr const char* ReferenceCommit = "8d89af29caa14ee413e94fc821c76458d8974836";
inline constexpr const char* ReferenceSolver = "ice-lab-f64/5";
inline constexpr const char* NativeImplementation = "kold-native-f64/5-UNTRANSCRIBED";
}}
