// Apache-2.0. Reference state loading verifies serialization, not solver parity.
#include "KoLdProtocol.h"
#include "KoLdMath.h"
#include <charconv>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

using namespace KoLd;
void Check(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}
double FromHex(const std::string& token) {
  std::uint64_t bits = 0;
  const auto r = std::from_chars(token.data(), token.data() + token.size(), bits, 16);
  Check(token.size() == 16 && r.ec == std::errc{} && r.ptr == token.data() + token.size(), "bad bits token");
  double v; std::memcpy(&v, &bits, 8); return v;
}
void Read(std::istream& in, double& v) {
  std::string token; Check(bool(in >> token), "missing numeric leaf"); v = FromHex(token);
}
void Read(std::istream& in, bool& v) {
  std::string token; Check(bool(in >> token) && (token == "true" || token == "false"), "bad boolean leaf"); v = token == "true";
}
template<class T> void Read(std::istream&, T&);
template<class T, std::size_t N> void Read(std::istream& in, std::array<T, N>& v) {
  for (auto& element : v) Read(in, element);
}
template<class T> void Read(std::istream& in, T& v) {
  Wire::Fields(v, [&](const char*, auto& field) { Read(in, field); });
}

int main(int argc, char** argv) {
  try {
    Check(argc == 2, "usage: native_check <reference-directory>");
    Check(Proto::StrictFpEnvironment(), "FP environment: rounding, contraction or subnormal failure");
    Check(!Proto::KernelAvailable, "foundation must not claim native solver availability");
    Check(Proto::Crc32("123456789") == 0xcbf43926u, "CRC known answer");
    Check(Proto::Crc32("") == 0u, "CRC empty");
    Check(Proto::Pointer("/0", "a~/b") == "/0/a~0~1b", "JSON pointer escapes");
    std::ifstream numbers(std::string(argv[1]) + "/numbers.tsv");
    Check(numbers.is_open(), "missing number corpus");
    std::string line; unsigned numberCount = 0;
    while (std::getline(numbers, line)) {
      const auto tab = line.find('\t'); Check(tab != std::string::npos, "bad number row");
      std::string actual;
      Check(Proto::JsNumber(FromHex(line.substr(0, tab)), actual), "number formatting failed");
      Check(actual == line.substr(tab + 1), "number spelling at row " + std::to_string(numberCount) + ": " + actual);
      ++numberCount;
    }
    Check(numberCount > 8000, "truncated number corpus");
    std::ifstream math(std::string(argv[1]) + "/math.tsv");
    Check(math.is_open(), "missing math corpus");
    unsigned mathCount = 0;
    while (std::getline(math, line)) {
      std::istringstream row(line); std::string name, a, b, expected, extra;
      Check(bool(row >> name >> a >> b >> expected) && !(row >> extra), "bad math row");
      const double x = FromHex(a), y = FromHex(b), want = FromHex(expected);
      double actual;
      if (name == "sin") actual = Math::sin(x);
      else if (name == "cos") actual = Math::cos(x);
      else if (name == "tan") actual = Math::tan(x);
      else if (name == "atan") actual = Math::atan(x);
      else if (name == "asin") actual = Math::asin(x);
      else if (name == "atan2") actual = Math::atan2(x, y);
      else { Check(name == "round", "unknown math function"); actual = Math::JsRound(x); }
      Check((std::isnan(want) && std::isnan(actual)) || std::memcmp(&actual, &want, 8) == 0,
            name + " bits differ at corpus row " + std::to_string(mathCount) + " input " + a + " " + b);
      ++mathCount;
    }
    Check(mathCount > 15000, "truncated math corpus");
    std::ifstream states(std::string(argv[1]) + "/states.tsv"); Check(states.is_open(), "missing states corpus");
    unsigned rows = 0;
    while (std::getline(states, line)) {
      const auto tab = line.find('\t'); Check(tab != std::string::npos, "bad state row");
      std::istringstream in(line.substr(0, tab));
      unsigned tick = 0, eventCount = 0; std::uint32_t expected = 0;
      Check(bool(in >> tick >> expected >> eventCount) && tick == rows && eventCount < 100, "bad row metadata");
      Wire::SkaterState state{}; std::vector<Wire::EdgeEvent> events(eventCount);
      Read(in, state); for (auto& event : events) Read(in, event);
      std::string extra; Check(!(in >> extra), "unconsumed reference leaves");
      Proto::CanonicalWriter out;
      Check(Proto::CanonicalPair(state, events, out), "canonical failed: " + out.errorPath);
      Check(out.bytes == line.substr(tab + 1), "canonical bytes differ at tick " + std::to_string(tick));
      Check(Proto::Crc32(out.bytes) == expected, "CRC differs at tick " + std::to_string(tick));
      if (tick == 1) Check(expected == 653800387u, "first recorded CRC");
      if (tick == 240) Check(expected == 2115996402u, "last recorded CRC");
      // Every reference row also exercises invalid state rejection at a known path.
      state.blade[0].contact.x = std::numeric_limits<double>::infinity();
      Check(!Proto::CanonicalPair(state, events, out) && out.errorPath == "/0/blade/0/contact/x", "illegal infinity path");
      ++rows;
    }
    Check(rows == 241, "oracle requires tick zero and 240 frames");
    Wire::SkaterState state{}; Proto::CanonicalWriter out;
    state.blade[0].turnRadius = std::numeric_limits<double>::infinity();
    Check(Proto::CanonicalPair(state, {}, out), "positive infinite turn radius allowed");
    state.blade[0].turnRadius = -std::numeric_limits<double>::infinity();
    Check(!Proto::CanonicalPair(state, {}, out) && out.errorPath == "/0/blade/0/turnRadius", "negative infinity rejected");
    state.blade[0].turnRadius = std::numeric_limits<double>::quiet_NaN();
    Check(!Proto::CanonicalPair(state, {}, out), "NaN rejected");
    state = {}; state.lean = -0.0;
    Check(std::signbit(state.lean), "signed-zero stored");
    Check(Proto::CanonicalPair(state, {}, out), "signed-zero serialization");
    const auto negativeZero = out.bytes;
    state.lean = 0.0;
    Check(Proto::CanonicalPair(state, {}, out) && out.bytes == negativeZero, "signed-zero normalized only in text");
    Proto::CanonicalWriter escaped;
    Check(escaped.String(std::string("\"\\\n\t\b\f\r") + char(1), ""), "ASCII escaping");
    Check(escaped.bytes == "\"\\\"\\\\\\n\\t\\b\\f\\r\\u0001\"", "JSON escapes");
    std::string unused;
    Check(!Proto::JsNumber(std::numeric_limits<double>::infinity(), unused), "number rejects infinity");
    std::cout << "PASS " << mathCount << " math vectors, " << numberCount << " JS number spellings, " << rows
              << " loaded reference states and CRCs; native kernel unavailable\n";
    return 0;
  } catch (const std::exception& e) { std::cerr << "FAIL: " << e.what() << '\n'; return 1; }
}
