// Apache-2.0. Transcribed from sim/math.ts at
// 8d89af29caa14ee413e94fc821c76458d8974836. Preserve constants and expression order.
// Original algorithms follow fdlibm (Sun, 1993), as documented in the TS source.
#include "KoLdMath.h"
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#if defined(__FAST_MATH__) || defined(_M_FP_FAST)
#error "KoLd math requires strict floating point"
#endif
namespace KoLd { namespace Math {
namespace {
constexpr double NaN = std::numeric_limits<double>::quiet_NaN();
constexpr double Infinity = std::numeric_limits<double>::infinity();
struct Reduction { double hi, lo, quadrant; };
}
double JsRound(double x) {
  if (!std::isfinite(x) || x == 0) return x;
  const double f = std::floor(x);
  const double r = x - f >= 0.5 ? f + 1.0 : f;
  return r == 0 && x < 0 ? -0.0 : r;
}
const double S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03;
const double S3 = -1.98412698298579493134e-04, S4 = 2.75573137070700676789e-06;
const double S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const double C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03;
const double C3 = 2.48015872894767294178e-05, C4 = -2.75573143513906633035e-07;
const double C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;

const double PIO4 = 7.85398163397448278999e-01;
const double INV_PIO2 = 6.36619772367581382433e-01;
const double PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11;
const double PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21;
const double PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;
const double PIO2_HI = 1.57079632679489655800e+00, PIO2_LO = 6.12323399573676603587e-17;
const double PI_HI = 3.1415926535897931160e+00, PI_LO = 1.2246467991473531772e-16;

/** sin on [-pi/4, pi/4], of x + y where y is the reduction's tail. */
double kSin(double x, double y) {
  const double z = x * x, v = z * x;
  const double r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return y == 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

/** cos on [-pi/4, pi/4], of x + y. */
double kCos(double x, double y) {
  const double z = x * x, w = z * z;
  const double r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const double hz = 0.5 * z, q = 1 - hz;
  return q + (((1 - q) - hz) + (z * r - x * y));
}


/** x = n pi/2 + (hi + lo); returns hi, lo and n mod 4 by value. */
Reduction reduce(double x) {
  const double fn = JsRound(x * INV_PIO2);
  double r = x - fn * PIO2_1, w = fn * PIO2_1T;
  double t = r;
  w = fn * PIO2_2; r = t - w; w = fn * PIO2_2T - ((t - r) - w);
  t = r;
  w = fn * PIO2_3; r = t - w; w = fn * PIO2_3T - ((t - r) - w);
  const double redHi = r - w;
  const double redLo = (r - redHi) - w;
  return {redHi, redLo, std::fmod(std::fmod(fn, 4.0) + 4.0, 4.0)};
}

/** Below 2^-27, sin and tan are x to the last bit — and -0 stays -0. */
const double TINY = 7.450580596923828e-9;

double sin(double x) {
  if (!std::isfinite(x)) return NaN;
  if (std::fabs(x) < TINY) return x;
  if (std::fabs(x) <= PIO4) return kSin(x, 0);
  const auto reduction = reduce(x);
  const double n = reduction.quadrant, redHi = reduction.hi, redLo = reduction.lo;
  if (n == 0) return kSin(redHi, redLo);
  if (n == 1) return kCos(redHi, redLo);
  if (n == 2) return -kSin(redHi, redLo);
  return -kCos(redHi, redLo);
}

double cos(double x) {
  if (!std::isfinite(x)) return NaN;
  if (std::fabs(x) <= PIO4) return kCos(x, 0);
  const auto reduction = reduce(x);
  const double n = reduction.quadrant, redHi = reduction.hi, redLo = reduction.lo;
  if (n == 0) return kCos(redHi, redLo);
  if (n == 1) return -kSin(redHi, redLo);
  if (n == 2) return -kCos(redHi, redLo);
  return kSin(redHi, redLo);
}

double tan(double x) {
  if (!std::isfinite(x)) return NaN;
  if (std::fabs(x) < TINY) return x;
  if (std::fabs(x) <= PIO4) return kSin(x, 0) / kCos(x, 0);
  const auto reduction = reduce(x);
  const double n = reduction.quadrant, redHi = reduction.hi, redLo = reduction.lo;
  const double s = kSin(redHi, redLo), c = kCos(redHi, redLo);
  return std::fmod(n, 2.0) == 0 ? s / c : -c / s;
}

const double ATAN_HI[] = {4.63647609000806093515e-01, 7.85398163397448278999e-01,
  9.82793723247329054082e-01, 1.57079632679489655800e+00};
const double ATAN_LO[] = {2.26987774529616870924e-17, 3.06161699786838301793e-17,
  1.39033110312309984516e-17, 6.12323399573676603587e-17};
const double AT0 = 3.33333333333329318027e-01, AT1 = -1.99999999998764832476e-01;
const double AT2 = 1.42857142725034663711e-01, AT3 = -1.11111104054623557880e-01;
const double AT4 = 9.09088713343650656196e-02, AT5 = -7.69187620504482999495e-02;
const double AT6 = 6.66107313738753120669e-02, AT7 = -5.83357013379057348645e-02;
const double AT8 = 4.97687799461593236017e-02, AT9 = -3.65315727442169155270e-02;
const double AT10 = 1.62858201153657823623e-02;

double atan(double x) {
  if (x != x) return NaN;
  const bool neg = x < 0;
  double a = std::fabs(x);
  if (a >= 7.378697629483821e19) return neg ? -(ATAN_HI[3] + ATAN_LO[3]) : ATAN_HI[3] + ATAN_LO[3];
  if (a < 7.450580596923828e-9) return x;   // 2^-27: atan(x) is x to the last bit
  int id = -1;
  if (a < 0.4375) id = -1;
  else if (a < 0.6875) { id = 0; a = (2 * a - 1) / (2 + a); }
  else if (a < 1.1875) { id = 1; a = (a - 1) / (a + 1); }
  else if (a < 2.4375) { id = 2; a = (a - 1.5) / (1 + 1.5 * a); }
  else { id = 3; a = -1 / a; }
  const double z = a * a, w = z * z;
  const double s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const double s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) { const double r = a - a * (s1 + s2); return neg ? -r : r; }
  const double r = ATAN_HI[id] - ((a * (s1 + s2) - ATAN_LO[id]) - a);
  return neg ? -r : r;
}

/** Quadrant-correct atan(y / x), with the IEEE signed-zero and infinity cases. */
double atan2(double y, double x) {
  if (x != x || y != y) return NaN;
  const bool yNeg = y < 0 || (y == 0 && 1 / y < 0);
  const bool xNeg = x < 0 || (x == 0 && 1 / x < 0);
  if (y == 0) return xNeg ? (yNeg ? -PI_HI : PI_HI) : y;
  if (x == 0) return yNeg ? -PIO2_HI : PIO2_HI;
  if (x == Infinity || x == -Infinity) {
    if (y == Infinity || y == -Infinity) {
      const double r = xNeg ? 3 * PIO4 : PIO4;
      return yNeg ? -r : r;
    }
    return xNeg ? (yNeg ? -PI_HI : PI_HI) : (yNeg ? -0.0 : 0.0);
  }
  if (y == Infinity || y == -Infinity) return yNeg ? -PIO2_HI : PIO2_HI;
  const double z = atan(std::fabs(y / x));
  if (!xNeg) return yNeg ? -z : z;
  return yNeg ? (z - PI_LO) - PI_HI : PI_HI - (z - PI_LO);
}

const double PIO4_HI = 7.85398163397448278999e-01;
const double PS0 = 1.66666666666666657415e-01, PS1 = -3.25565818622400915405e-01;
const double PS2 = 2.01212532134862925881e-01, PS3 = -4.00555345006794114027e-02;
const double PS4 = 7.91534994289814532176e-04, PS5 = 3.47933107596021167570e-05;
const double QS1 = -2.40339491173441421878e+00, QS2 = 2.02094576023350569471e+00;
const double QS3 = -6.88283971605453293030e-01, QS4 = 7.70381505559019352791e-02;

// Mask the low word through a local integer; no shared DataView scratch.


double asin(double x) {
  if (x != x) return NaN;
  const double a = std::fabs(x);
  if (a > 1) return NaN;
  if (a == 1) return x * PIO2_HI + x * PIO2_LO;
  if (a < 0.5) {
    if (a < 7.450580596923828e-9) return x;
    const double t = x * x;
    const double p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
    const double q = 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
    return x + x * (p / q);
  }
  const double t = (1 - a) * 0.5;
  const double p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
  const double q = 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
  const double s = std::sqrt(t);
  double r;
  if (a >= 0.975) {
    r = PIO2_HI - (2 * (s + s * (p / q)) - PIO2_LO);
  } else {
    std::uint64_t bits; std::memcpy(&bits, &s, 8); bits &= 0xffffffff00000000ULL;
    double w; std::memcpy(&w, &bits, 8);
    const double c = (t - w * w) / (s + w);
    const double pp = 2 * s * (p / q) - (PIO2_LO - 2 * c);
    const double qq = PIO4_HI - 2 * w;
    r = PIO4_HI - (pp - qq);
  }
  return x < 0 ? -r : r;
}


}}
