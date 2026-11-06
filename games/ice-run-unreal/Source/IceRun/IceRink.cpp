#include "IceRink.h"
#include "IceRun.h"
#include "IceSimSpace.h"
#include "ProceduralMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/PostProcessComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "TimerManager.h"
#include "Components/TextRenderComponent.h"

namespace
{
	constexpr double BoardHeight = 107.0; // cm, a rink's boards
	constexpr double BoardThickness = 12.0;
	constexpr double RailHeight = 6.0;
	constexpr double GrooveWidth = 1.1; // cm, arena.gd's groove
	constexpr double GrooveLift = .4;   // cm above the sheet
	constexpr double TraceStep = .05;   // m sideways off a blade's own line that no edge can carve
	constexpr int32 CornerSegments = 24;
	// Emissive is in the lit rink's own units: at EV100 9 a surface needs about 600 nits to read white.
	constexpr float DimGlow = 60.f;
	constexpr float TargetGlow = 1600.f;

	FLinearColor Hex(const TCHAR* Code) { return FLinearColor::FromSRGBColor(FColor::FromHex(Code)); }

	/**
	 * Adds a triangle facing along Normal, whichever order the corners came in. Unreal's front
	 * face is the one whose corners run clockwise seen from in front: (B-A) x (C-A) points away
	 * from the viewer in its left-handed numbers (measured: the other order culled the sheet).
	 */
	void Triangle(TArray<int32>& Triangles, const TArray<FVector>& Vertices, int32 A, int32 B, int32 C, const FVector& Normal)
	{
		const FVector Face = FVector::CrossProduct(Vertices[B] - Vertices[A], Vertices[C] - Vertices[A]);
		if (FVector::DotProduct(Face, Normal) <= 0.0)
		{
			Triangles.Append({A, B, C});
		}
		else
		{
			Triangles.Append({A, C, B});
		}
	}
}

AIceRink::AIceRink()
{
	PrimaryActorTick.bCanEverTick = false;
	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Sheet = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Sheet"));
	Sheet->SetupAttachment(Root);
	Boards = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Boards"));
	Boards->SetupAttachment(Root);
	Grooves = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Grooves"));
	Grooves->SetupAttachment(Root);
	Grooves->SetCastShadow(false);
	Markers = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Markers"));
	Markers->SetupAttachment(Root);
	Markers->SetCastShadow(false);
	Lesson = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Lesson"));
	Lesson->SetupAttachment(Root);
	Lesson->SetCastShadow(false);
	Arrow = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Arrow"));
	Arrow->SetupAttachment(Root);
	Arrow->SetCastShadow(false);
	Arrow->SetVisibility(false);
	for (UProceduralMeshComponent* Mesh : {Sheet.Get(), Boards.Get(), Grooves.Get(), Markers.Get(), Lesson.Get(), Arrow.Get()})
	{
		Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}
}

void AIceRink::BeginPlay()
{
	Super::BeginPlay();
	// tools/build_content.py makes these; before it has run, the engine's own plain material stands in.
	UMaterialInterface* Generated = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_Surface.M_Surface"), nullptr, LOAD_NoWarn | LOAD_Quiet);
	UMaterialInterface* Ice = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_Ice.M_Ice"), nullptr, LOAD_NoWarn | LOAD_Quiet);
	SurfaceBase = Generated ? Generated : LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	IceBase = Ice ? Ice : SurfaceBase.Get();
	if (!Generated || !Ice)
	{
		UE_LOG(LogIceRun, Warning, TEXT("Generated materials are missing: run games/ice-run-unreal/tools/prepare.mjs. Plain engine material instead."));
	}
}

UMaterialInstanceDynamic* AIceRink::Surface(const FLinearColor& Color, float Roughness, float Metallic, float Emissive)
{
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(SurfaceBase, this);
	M->SetVectorParameterValue(TEXT("Color"), Color);
	M->SetScalarParameterValue(TEXT("Roughness"), Roughness);
	M->SetScalarParameterValue(TEXT("Metallic"), Metallic);
	M->SetScalarParameterValue(TEXT("Emissive"), Emissive);
	return M;
}

void AIceRink::Build(double MinX, double MaxX, double MinY, double MaxY, double Corner)
{
	// The boundary, anticlockwise in the sim's plan: game/rink.ts's rounded rectangle.
	TArray<FVector> Outline;
	const FVector2D Centres[4] = {{MaxX - Corner, MaxY - Corner}, {MinX + Corner, MaxY - Corner}, {MinX + Corner, MinY + Corner}, {MaxX - Corner, MinY + Corner}};
	for (int32 C = 0; C < 4; ++C)
	{
		for (int32 S = 0; S <= CornerSegments; ++S)
		{
			const double A = (C * 90.0 + S * 90.0 / CornerSegments) * UE_DOUBLE_PI / 180.0;
			Outline.Add(IceSimSpace::Point(Centres[C].X + FMath::Cos(A) * Corner, Centres[C].Y + FMath::Sin(A) * Corner));
		}
	}
	const FVector Middle = IceSimSpace::Point((MinX + MaxX) * .5, (MinY + MaxY) * .5);

	// The sheet: a fan from the middle; the rounded square is convex.
	{
		TArray<FVector> V = {Middle};
		TArray<int32> T;
		TArray<FVector> N;
		TArray<FVector2D> UV;
		V.Append(Outline);
		for (const FVector& P : V)
		{
			N.Add(FVector::UpVector);
			UV.Add(FVector2D(P.X, P.Y) / 400.0);
		}
		for (int32 I = 1; I < V.Num(); ++I)
		{
			Triangle(T, V, 0, I, I == V.Num() - 1 ? 1 : I + 1, FVector::UpVector);
		}
		Sheet->CreateMeshSection_LinearColor(0, V, T, N, UV, {}, {}, false);
		UMaterialInstanceDynamic* IceMaterial = UMaterialInstanceDynamic::Create(IceBase, this);
		IceMaterial->SetVectorParameterValue(TEXT("Color"), Hex(TEXT("eef6fb")));
		IceMaterial->SetScalarParameterValue(TEXT("Roughness"), .06f);
		IceMaterial->SetScalarParameterValue(TEXT("Metallic"), 0.f);
		IceMaterial->SetScalarParameterValue(TEXT("Emissive"), 0.f);
		Sheet->SetMaterial(0, IceMaterial);
	}

	// The boards: an inner face, a top rail and an outer face round the outline.
	{
		TArray<FVector> Wall, Rail;
		TArray<int32> WallT, RailT;
		TArray<FVector> WallN, RailN;
		const int32 Count = Outline.Num();
		for (int32 I = 0; I < Count; ++I)
		{
			const FVector A = Outline[I];
			const FVector B = Outline[(I + 1) % Count];
			const FVector Along = (B - A).GetSafeNormal();
			const FVector Inward = FVector(Middle - (A + B) * .5).GetSafeNormal2D();
			// The outline is round enough that each piece's own inward normal reads as one wall.
			const FVector In = FVector::CrossProduct(Along, FVector::UpVector).GetSafeNormal() * (FVector::DotProduct(FVector::CrossProduct(Along, FVector::UpVector), Inward) >= 0 ? 1.0 : -1.0);
			const FVector Out = -In * BoardThickness;
			auto Quad = [](TArray<FVector>& V, TArray<int32>& T, TArray<FVector>& N, const FVector& P0, const FVector& P1, const FVector& P2, const FVector& P3, const FVector& Normal)
			{
				const int32 Base = V.Num();
				V.Append({P0, P1, P2, P3});
				N.Append({Normal, Normal, Normal, Normal});
				Triangle(T, V, Base, Base + 1, Base + 2, Normal);
				Triangle(T, V, Base, Base + 2, Base + 3, Normal);
			};
			const FVector H(0, 0, BoardHeight);
			const FVector R(0, 0, BoardHeight + RailHeight);
			Quad(Wall, WallT, WallN, A, B, B + H, A + H, In);
			Quad(Wall, WallT, WallN, A + Out, B + Out, B + Out + H, A + Out + H, -In);
			// The rail overhangs the inner face by 2 cm.
			Quad(Rail, RailT, RailN, A + H + In * 2.0, B + H + In * 2.0, B + R + In * 2.0, A + R + In * 2.0, In);
			Quad(Rail, RailT, RailN, A + R + In * 2.0, B + R + In * 2.0, B + Out + R, A + Out + R, FVector::UpVector);
			Quad(Rail, RailT, RailN, A + Out + H, B + Out + H, B + Out + R, A + Out + R, -In);
		}
		Boards->CreateMeshSection_LinearColor(0, Wall, WallT, WallN, {}, {}, {}, false);
		Boards->CreateMeshSection_LinearColor(1, Rail, RailT, RailN, {}, {}, {}, false);
		Boards->SetMaterial(0, Surface(Hex(TEXT("d8e5e9")), .35f, .12f));
		Boards->SetMaterial(1, Surface(Hex(TEXT("173b51")), .23f, .65f));
	}

	// The hall, after arena.gd: concrete under everything, four raked banks, a dark roof.
	// arena.gd's colours, lifted: under physically scaled light its display tones read nearly black.
	UMaterialInstanceDynamic* Concrete = Surface(Hex(TEXT("6c7c8c")), .88f);
	UMaterialInstanceDynamic* Dark = Surface(Hex(TEXT("2a3646")), .6f, .25f);
	UMaterialInstanceDynamic* Seats = Surface(Hex(TEXT("34557d")), .85f);
	UMaterialInstanceDynamic* Steel = Surface(Hex(TEXT("173b51")), .23f, .65f);
	const FVector Floor = Middle - FVector(0, 0, 1.0);
	Box(FVector(10500, 10500, 50), Floor - FVector(0, 0, 26), 0, Concrete);
	RoofParts.Add(Box(FVector(10000, 10000, 40), Middle + FVector(0, 0, 2000), 0, Dark, false));
	for (int32 Side = 0; Side < 4; ++Side)
	{
		const double Yaw = Side * 90.0;
		const FRotator Turn(0, Yaw, 0);
		for (int32 Row = 0; Row < 9; ++Row)
		{
			const double Depth = 3150 + Row * 135;
			const double Height = 50 + Row * 72;
			Box(FVector(135, 6900, 60), Middle + Turn.RotateVector(FVector(Depth, 0, Height - 30)), Yaw, Concrete);
			Box(FVector(46, 6900, 36), Middle + Turn.RotateVector(FVector(Depth + 30, 0, Height + 18)), Yaw, Seats);
		}
		Box(FVector(50, 9100, 1200), Middle + Turn.RotateVector(FVector(4500, 0, 800)), Yaw, Dark);
		Box(FVector(30, 7200, 140), Middle + Turn.RotateVector(FVector(4300, 0, 820)), Yaw, Steel);
		Box(FVector(12, 7200, 4.5), Middle + Turn.RotateVector(FVector(4280, 0, 745)), Yaw, Surface(Hex(TEXT("daedff")), .24f, 0.f, 2000.f), false);
	}
	// Roof trusses and the fixtures' housings.
	for (int32 Z = -2; Z <= 2; ++Z)
	{
		RoofParts.Add(Box(FVector(8600, 14, 14), Middle + FVector(0, Z * 1600, 1600), 0, Steel, false));
		RoofParts.Add(Box(FVector(8600, 14, 14), Middle + FVector(0, Z * 1600, 1800), 0, Steel, false));
		for (int32 X = -2; X <= 2; ++X)
		{
			RoofParts.Add(Box(FVector(300, 80, 18), Middle + FVector(X * 1200, Z * 1100, 1565), 0, Dark, false));
			RoofParts.Add(Box(FVector(270, 62, 3.5), Middle + FVector(X * 1200, Z * 1100, 1553), 0, Surface(Hex(TEXT("daedff")), .24f, 0.f, 20000.f), false));
		}
	}
	SeatCrowd(Middle);
	Officials(Middle);
	Lights();
	UE_LOG(LogIceRun, Log, TEXT("Rink built: %d outline points, sheet %.0f x %.0f m, corner %.0f m."), Outline.Num(), MaxX - MinX, MaxY - MinY, Corner);
}

namespace
{
	/** A colour as arena.gd hands it to its shader: the hex's own values, not converted from sRGB. */
	FLinearColor RawColour(const TCHAR* HexText)
	{
		const FColor C = FColor::FromHex(HexText);
		return FLinearColor(C.R / 255.f, C.G / 255.f, C.B / 255.f);
	}
}

void AIceRink::SeatCrowd(const FVector& Middle)
{
	FString Manifest, MeshPath, MaterialPath;
	TSharedPtr<FJsonObject> Paths;
	if (!FFileHelper::LoadFileToString(Manifest, *FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Generated/crowd.json"))) || !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Manifest), Paths) || !Paths.IsValid())
	{
		UE_LOG(LogIceRun, Log, TEXT("No audience: Content/Generated/crowd.json is missing; tools/prepare.mjs builds it."));
		return;
	}
	Paths->TryGetStringField(TEXT("mesh"), MeshPath);
	Paths->TryGetStringField(TEXT("material"), MaterialPath);
	UStaticMesh* Body = MeshPath.IsEmpty() ? nullptr : LoadObject<UStaticMesh>(nullptr, *MeshPath, nullptr, LOAD_NoWarn | LOAD_Quiet);
	UMaterialInterface* Look = MaterialPath.IsEmpty() ? nullptr : LoadObject<UMaterialInterface>(nullptr, *MaterialPath, nullptr, LOAD_NoWarn | LOAD_Quiet);
	if (!Body || !Look)
	{
		UE_LOG(LogIceRun, Warning, TEXT("No audience: %s or %s did not load."), *MeshPath, *MaterialPath);
		return;
	}
	Crowd = NewObject<UInstancedStaticMeshComponent>(this);
	Crowd->SetStaticMesh(Body);
	Crowd->SetupAttachment(RootComponent);
	Crowd->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Crowd->SetCastShadow(false);
	// Per person (M_Crowd): the coat (0-2), the skin (3-5), their own timing (6).
	Crowd->SetNumCustomDataFloats(7);
	CrowdMaterial = UMaterialInstanceDynamic::Create(Look, this);
	Crowd->SetMaterial(0, CrowdMaterial);
	Crowd->RegisterComponent();
	// arena.gd: on each bank nine rows of 113 seats at a 60 cm pitch, in blocks with three-seat aisles
	// every 28, about six seats in seven taken. The spectator faces its +Y once imported: turned to the ice.
	const FLinearColor Coats[] = {RawColour(TEXT("35475e")), RawColour(TEXT("5f5064")), RawColour(TEXT("939495")), RawColour(TEXT("9e7465")), RawColour(TEXT("233342")), RawColour(TEXT("4d6670"))};
	const FLinearColor Fair = RawColour(TEXT("a07a62")), Deep = RawColour(TEXT("47332a"));
	FRandomStream Random(0xA0D1);
	TArray<FTransform> Bodies;
	TArray<float> Data;
	for (int32 Side = 0; Side < 4; ++Side)
	{
		const double Yaw = Side * 90.0;
		const FRotator Turn(0, Yaw, 0);
		for (int32 Row = 0; Row < 9; ++Row)
		{
			const double Depth = 3150 + Row * 135;
			const double Height = 50 + Row * 72;
			for (int32 Seat = 0; Seat < 113; ++Seat)
			{
				if (Seat % 28 < 3 || Random.FRand() <= .14f)
				{
					continue;
				}
				const double Along = (-33.8 + Seat * .6) * 100.0;
				const float Size = Random.FRandRange(.94f, 1.06f);
				const double Settled = FMath::RadiansToDegrees(Random.FRandRange(-.14f, .14f));
				const FLinearColor Coat = Coats[Random.RandHelper(UE_ARRAY_COUNT(Coats))] * .5f;
				const FLinearColor Skin = FMath::Lerp(Fair, Deep, FMath::Pow(Random.FRand(), 1.5f));
				Bodies.Add(FTransform(FRotator(0, Yaw + 90.0 + Settled, 0), Middle + Turn.RotateVector(FVector(Depth + 30, Along, Height)), FVector(Size)));
				Data.Append({Coat.R, Coat.G, Coat.B, Skin.R, Skin.G, Skin.B, Random.FRand()});
			}
		}
	}
	Crowd->AddInstances(Bodies, false, true, false);
	for (int32 I = 0; I < Bodies.Num(); ++I)
	{
		Crowd->SetCustomData(I, TArrayView<const float>(Data.GetData() + I * 7, 7), false);
	}
	Crowd->MarkRenderStateDirty();
	UE_LOG(LogIceRun, Log, TEXT("Audience seated: %d."), Bodies.Num());
}

void AIceRink::CrowdReact(double Amount)
{
	CrowdMood = FMath::Max(CrowdMood, Amount);
}

void AIceRink::UpdateCrowd(const FVector& SkaterAt, float Dt)
{
	// arena.gd update_crowd: a reaction rises at once and takes three and a half seconds to die away.
	CrowdMood = FMath::Max(0.0, CrowdMood - Dt / 3.5);
	if (CrowdMaterial)
	{
		CrowdMaterial->SetVectorParameterValue(TEXT("Skater"), FLinearColor(SkaterAt.X, SkaterAt.Y, SkaterAt.Z, 0.f));
		CrowdMaterial->SetScalarParameterValue(TEXT("Cheer"), float(CrowdMood));
	}
}

UStaticMeshComponent* AIceRink::Box(const FVector& Size, const FVector& Center, double YawDegrees, UMaterialInterface* Material, bool bShadow)
{
	UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	UStaticMeshComponent* Mesh = NewObject<UStaticMeshComponent>(this);
	Mesh->SetStaticMesh(Cube);
	Mesh->SetupAttachment(RootComponent);
	Mesh->SetWorldLocationAndRotation(Center, FRotator(0, YawDegrees, 0));
	// The engine cube is a metre on a side.
	Mesh->SetWorldScale3D(Size / 100.0);
	Mesh->SetMaterial(0, Material);
	Mesh->SetCastShadow(bShadow);
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->RegisterComponent();
	return Mesh;
}

void AIceRink::Lights()
{
	const FVector Middle = IceSimSpace::Point(0.0, IceSimSpace::RinkCentreY);
	// arena.gd's 5 x 5 grid of roof fixtures, 14.5 m up, aimed straight down, their beams
	// wide enough to overlap as an arena's do: about 1,200 lux across the ice, a televised rink's level.
	for (int32 Row = -2; Row <= 2; ++Row)
	{
		for (int32 Column = -2; Column <= 2; ++Column)
		{
			USpotLightComponent* Spot = NewObject<USpotLightComponent>(this);
			Spot->SetupAttachment(RootComponent);
			Spot->SetWorldLocationAndRotation(Middle + FVector(Column * 1200, Row * 1100, 1450), FRotator(-90, 0, 0));
			Spot->SetIntensityUnits(ELightUnits::Candelas);
			Spot->SetIntensity(110000.f);
			Spot->SetLightColor(Hex(TEXT("eaf2ff")));
			Spot->SetInnerConeAngle(30.f);
			Spot->SetOuterConeAngle(52.f);
			Spot->SetAttenuationRadius(4200.f);
			Spot->SetSourceRadius(60.f);
			// The middle nine draw the skater's shadow; the rest only light.
			Spot->SetCastShadows(FMath::Abs(Row) <= 1 && FMath::Abs(Column) <= 1);
			Spot->SetMobility(EComponentMobility::Movable);
			Spot->RegisterComponent();
		}
	}
	// arena.gd's soft directional fill, no shadows; Lumen carries the bounce its other two stood in for.
	UDirectionalLightComponent* Fill = NewObject<UDirectionalLightComponent>(this);
	Fill->SetupAttachment(RootComponent);
	Fill->SetWorldRotation(FRotator(-68, 32, 0));
	Fill->SetIntensity(80.f);
	Fill->SetLightColor(Hex(TEXT("e5efff")));
	Fill->SetCastShadows(false);
	Fill->SetMobility(EComponentMobility::Movable);
	Fill->RegisterComponent();
	// House lights: the banks are lit for the audience, more softly than the ice (arena.gd's
	// ambient stood in for these). Three per side from the roof's edge, aimed out and down.
	for (int32 Side = 0; Side < 4; ++Side)
	{
		const FRotator Turn(0, Side * 90.0, 0);
		for (int32 Along = -1; Along <= 1; ++Along)
		{
			USpotLightComponent* House = NewObject<USpotLightComponent>(this);
			House->SetupAttachment(RootComponent);
			House->SetWorldLocationAndRotation(Middle + Turn.RotateVector(FVector(2500, Along * 2200, 1400)), FRotator(-42, Side * 90.0, 0));
			House->SetIntensityUnits(ELightUnits::Candelas);
			House->SetIntensity(40000.f);
			House->SetLightColor(Hex(TEXT("ffe7cc")));
			House->SetInnerConeAngle(20.f);
			House->SetOuterConeAngle(44.f);
			House->SetAttenuationRadius(4000.f);
			House->SetCastShadows(false);
			House->SetMobility(EComponentMobility::Movable);
			House->RegisterComponent();
		}
	}
	// What the bright ice throws back up, and what little the roof gives: captured once the hall stands.
	Sky = NewObject<USkyLightComponent>(this);
	Sky->SetupAttachment(RootComponent);
	Sky->SetMobility(EComponentMobility::Movable);
	Sky->SourceType = ESkyLightSourceType::SLS_CapturedScene;
	Sky->SetIntensity(1.f);
	Sky->SetLightColor(Hex(TEXT("bacddd")));
	Sky->RegisterComponent();
	GetWorldTimerManager().SetTimer(SkyTimer, this, &AIceRink::RecaptureSky, 2.f, false);

	UExponentialHeightFogComponent* Fog = NewObject<UExponentialHeightFogComponent>(this);
	Fog->SetupAttachment(RootComponent);
	Fog->SetWorldLocation(Middle);
	Fog->SetFogDensity(.004f);
	Fog->SetFogHeightFalloff(.05f);
	Fog->SetFogInscatteringColor(Hex(TEXT("34465b")));
	Fog->SetVolumetricFog(true);
	Fog->SetVolumetricFogScatteringDistribution(.35f);
	Fog->SetVolumetricFogExtinctionScale(.6f);
	Fog->RegisterComponent();

	UPostProcessComponent* Grade = NewObject<UPostProcessComponent>(this);
	Grade->SetupAttachment(RootComponent);
	Grade->bUnbound = true;
	FPostProcessSettings& P = Grade->Settings;
	// Exposure for a lit rink, fixed so the ice does not breathe as the camera turns.
	P.bOverride_AutoExposureMethod = true;
	P.AutoExposureMethod = EAutoExposureMethod::AEM_Manual;
	P.bOverride_AutoExposureApplyPhysicalCameraExposure = true;
	P.AutoExposureApplyPhysicalCameraExposure = false;
	// Manual exposure scales by 2^bias, so EV100 9 (a lit rink, about 1,200 lux) is a bias of -9.
	P.bOverride_AutoExposureBias = true;
	P.AutoExposureBias = -9.f;
	P.bOverride_BloomIntensity = true;
	P.BloomIntensity = .35f;
	P.bOverride_ColorSaturation = true;
	P.ColorSaturation = FVector4(1.1, 1.1, 1.1, 1.0);
	P.bOverride_ColorContrast = true;
	P.ColorContrast = FVector4(1.05, 1.05, 1.05, 1.0);
	P.bOverride_VignetteIntensity = true;
	P.VignetteIntensity = .25f;
	Grade->RegisterComponent();
}

void AIceRink::SetCourse(const FString& Mode, const TSharedPtr<FJsonObject>& Catalog)
{
	for (const TWeakObjectPtr<UPrimitiveComponent>& Part : CourseParts)
	{
		if (Part.IsValid())
		{
			Part->DestroyComponent();
		}
	}
	CourseParts.Reset();
	MarkerMaterials.Reset();
	Markers->ClearAllMeshSections();
	Target = -1;
	const bool bGates = Mode == TEXT("rookie");
	const TArray<TSharedPtr<FJsonValue>>* Points = nullptr;
	if (!Catalog.IsValid() || !(bGates || Mode == TEXT("timed")) || !Catalog->TryGetArrayField(bGates ? TEXT("gates") : TEXT("lights"), Points))
	{
		return;
	}
	constexpr int32 Segments = 48;
	constexpr double Inner = 170.0, Outer = 183.0, Lift = .6; // cm: arena.gd's torus, flat on the ice
	UStaticMesh* Cone = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cone.Cone"));
	UMaterialInstanceDynamic* Orange = Surface(Hex(TEXT("ff7a2f")), .5f, 0.f, .4f);
	for (int32 I = 0; I < Points->Num(); ++I)
	{
		const TSharedPtr<FJsonObject> P = (*Points)[I]->AsObject();
		const double X = P->GetNumberField(TEXT("x")), Y = P->GetNumberField(TEXT("y"));
		const FVector Centre = IceSimSpace::Point(X, Y) + FVector(0, 0, Lift);
		TArray<FVector> V;
		TArray<int32> T;
		TArray<FVector> N;
		for (int32 K = 0; K <= Segments; ++K)
		{
			const double A = K * UE_DOUBLE_TWO_PI / Segments;
			const FVector Dir(FMath::Cos(A), FMath::Sin(A), 0.0);
			V.Append({Centre + Dir * Inner, Centre + Dir * Outer});
			N.Append({FVector::UpVector, FVector::UpVector});
		}
		for (int32 K = 0; K < Segments; ++K)
		{
			const int32 B = K * 2;
			Triangle(T, V, B, B + 1, B + 3, FVector::UpVector);
			Triangle(T, V, B, B + 3, B + 2, FVector::UpVector);
		}
		Markers->CreateMeshSection_LinearColor(I, V, T, N, {}, {}, {}, false);
		UMaterialInstanceDynamic* Glow = Surface(bGates ? Hex(TEXT("c6b393")) : Hex(TEXT("8fd3ff")), .4f, .1f, DimGlow);
		Markers->SetMaterial(I, Glow);
		MarkerMaterials.Add(Glow);
		if (!bGates || !Cone)
		{
			continue;
		}
		// game/rookie.ts: two soft cones a gate, 3.8 m either side across the lane; a foam bar on the jumps.
		const double Angle = P->GetNumberField(TEXT("angle"));
		for (const double Offset : {-3.8, 3.8})
		{
			UStaticMeshComponent* Mesh = NewObject<UStaticMeshComponent>(this);
			Mesh->SetStaticMesh(Cone);
			Mesh->SetupAttachment(RootComponent);
			Mesh->SetWorldLocation(IceSimSpace::Point(X + FMath::Sin(Angle) * Offset, Y - FMath::Cos(Angle) * Offset, .23));
			Mesh->SetWorldScale3D(FVector(.32, .32, .46));
			Mesh->SetMaterial(0, Orange);
			Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			Mesh->RegisterComponent();
			CourseParts.Add(Mesh);
		}
		bool bJump = false;
		if (P->TryGetBoolField(TEXT("jump"), bJump) && bJump)
		{
			const FVector Across = IceSimSpace::Direction(FMath::Sin(Angle), -FMath::Cos(Angle));
			CourseParts.Add(Box(FVector(7.0 * IceSimSpace::CmPerM, 9.0, 9.0), IceSimSpace::Point(X, Y, .22), FMath::RadiansToDegrees(FMath::Atan2(Across.Y, Across.X)), Orange, true));
		}
	}
}

void AIceRink::SetTarget(int32 Index)
{
	if (MarkerMaterials.Num() == 0)
	{
		return;
	}
	const int32 Next = Index % MarkerMaterials.Num();
	if (Next == Target)
	{
		return;
	}
	if (MarkerMaterials.IsValidIndex(Target))
	{
		MarkerMaterials[Target]->SetScalarParameterValue(TEXT("Emissive"), DimGlow);
	}
	MarkerMaterials[Next]->SetScalarParameterValue(TEXT("Emissive"), TargetGlow);
	Target = Next;
}

void AIceRink::Ring(UProceduralMeshComponent* Mesh, int32 Section, const FVector& Centre, double Inner, double Outer, UMaterialInterface* Material)
{
	constexpr int32 Segments = 64;
	TArray<FVector> V;
	TArray<int32> T;
	TArray<FVector> N;
	for (int32 K = 0; K <= Segments; ++K)
	{
		const double A = K * UE_DOUBLE_TWO_PI / Segments;
		const FVector Dir(FMath::Cos(A), FMath::Sin(A), 0.0);
		V.Append({Centre + Dir * Inner, Centre + Dir * Outer});
		N.Append({FVector::UpVector, FVector::UpVector});
	}
	for (int32 K = 0; K < Segments; ++K)
	{
		const int32 B = K * 2;
		Triangle(T, V, B, B + 1, B + 3, FVector::UpVector);
		Triangle(T, V, B, B + 3, B + 2, FVector::UpVector);
	}
	Mesh->CreateMeshSection_LinearColor(Section, V, T, N, {}, {}, {}, false);
	Mesh->SetMaterial(Section, Material);
}

void AIceRink::SetTutorialTargets(const TArray<FIceTarget>& Targets, int32 Next)
{
	if (Targets == LessonTargets)
	{
		if (Next != LessonNext)
		{
			for (int32 I = 0; I < LessonMaterials.Num(); ++I)
			{
				LessonMaterials[I]->SetScalarParameterValue(TEXT("Emissive"), I == Next ? TargetGlow : DimGlow);
			}
			LessonNext = Next;
		}
		return;
	}
	LessonTargets = Targets;
	LessonNext = Next;
	Lesson->ClearAllMeshSections();
	LessonMaterials.Reset();
	for (const TWeakObjectPtr<UPrimitiveComponent>& Part : LessonParts)
	{
		if (Part.IsValid())
		{
			Part->DestroyComponent();
		}
	}
	LessonParts.Reset();
	UStaticMesh* Cone = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cone.Cone"));
	for (int32 I = 0; I < Targets.Num(); ++I)
	{
		const FIceTarget& T = Targets[I];
		const bool bCone = T.Kind == TEXT("cone");
		UMaterialInstanceDynamic* Glow = Surface(bCone ? Hex(TEXT("ff7a2f")) : T.Kind == TEXT("checkpoint") ? Hex(TEXT("9fe0b8")) : Hex(TEXT("d8c295")), .4f, .1f, I == Next ? TargetGlow : DimGlow);
		LessonMaterials.Add(Glow);
		const FVector Centre = IceSimSpace::Point(T.X, T.Y) + FVector(0, 0, .7);
		// The ring is the reach the step measures: inside it counts.
		const double Outer = FMath::Max(T.R, bCone ? 0.6 : T.R) * IceSimSpace::CmPerM;
		Ring(Lesson, I, Centre, Outer - 14.0, Outer, Glow);
		if (bCone && Cone)
		{
			UStaticMeshComponent* Mesh = NewObject<UStaticMeshComponent>(this);
			Mesh->SetStaticMesh(Cone);
			Mesh->SetupAttachment(RootComponent);
			Mesh->SetWorldLocation(IceSimSpace::Point(T.X, T.Y, .35));
			Mesh->SetWorldScale3D(FVector(.5, .5, .7));
			Mesh->SetMaterial(0, Glow);
			Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			Mesh->RegisterComponent();
			LessonParts.Add(Mesh);
		}
	}
}

void AIceRink::PointArrow(const FVector& Skater, const TOptional<FVector2D>& Aim)
{
	if (!Aim.IsSet())
	{
		Arrow->SetVisibility(false);
		return;
	}
	const FVector Goal = IceSimSpace::Point(Aim->X, Aim->Y);
	FVector Toward = FVector(Goal.X - Skater.X, Goal.Y - Skater.Y, 0.0);
	const double Distance = Toward.Size();
	// Close enough to see the ring itself: no arrow over it.
	if (Distance < 350.0)
	{
		Arrow->SetVisibility(false);
		return;
	}
	Toward /= Distance;
	if (Arrow->GetNumSections() == 0)
	{
		// A flat chevron, 1.2 m long, its tip along +X.
		const TArray<FVector> V = {{70, 0, 0}, {-50, 55, 0}, {-15, 0, 0}, {-50, -55, 0}};
		TArray<int32> T;
		Triangle(T, V, 0, 1, 2, FVector::UpVector);
		Triangle(T, V, 0, 2, 3, FVector::UpVector);
		Arrow->CreateMeshSection_LinearColor(0, V, T, {FVector::UpVector, FVector::UpVector, FVector::UpVector, FVector::UpVector}, {}, {}, {}, false);
		Arrow->SetMaterial(0, Surface(Hex(TEXT("d8c295")), .4f, .1f, TargetGlow));
	}
	Arrow->SetWorldLocationAndRotation(FVector(Skater.X, Skater.Y, 1.0) + Toward * 240.0, FRotator(0.0, FMath::RadiansToDegrees(FMath::Atan2(Toward.Y, Toward.X)), 0.0));
	Arrow->SetVisibility(true);
}

void AIceRink::RecaptureSky()
{
	if (Sky)
	{
		Sky->RecaptureSky();
	}
}

void AIceRink::ClearTraces()
{
	Grooves->ClearAllMeshSections();
	GrooveVertices.Reset();
	GrooveTriangles.Reset();
	GrooveNormals.Reset();
	GrooveSection = 0;
	SectionSegments = 0;
	Traces = 0;
	Previous[0].Reset();
	Previous[1].Reset();
	TraceHeading[0] = TraceHeading[1] = FVector::ZeroVector;
}

void AIceRink::AddTraces(const TArray<FIceTraceSample>& Samples, int32 LiftedBlade)
{
	if (!GrooveMaterial)
	{
		// A cut in bright ice reads darker than the ice round it, in the shade of its wall.
		GrooveMaterial = Surface(Hex(TEXT("a9bfcd")), .55f);
	}
	bool bAdded = false;
	for (const FIceTraceSample& Sample : Samples)
	{
		for (int32 I = 0; I < 2; ++I)
		{
			const FVector Point = IceSimSpace::Point(Sample.At[I].X, Sample.At[I].Y) + FVector(0, 0, GrooveLift);
			const bool bCutting = Sample.bContact[I] && I != LiftedBlade;
			if (bCutting && Previous[I].IsSet())
			{
				const FVector Delta = Point - Previous[I].GetValue();
				const double Length = Delta.Size() / IceSimSpace::CmPerM;
				// The solver moves a contact in one tick when the support changes: a foot
				// set down, not a cut, so the line ends and a new one starts.
				const bool bStepped = !TraceHeading[I].IsZero() && FMath::Abs(FVector::CrossProduct(Delta / IceSimSpace::CmPerM, TraceHeading[I]).Z) > TraceStep;
				if (bStepped)
				{
					TraceHeading[I] = FVector::ZeroVector;
				}
				else if (Length > .015 && Length < 1.5)
				{
					const FVector Across = FVector::CrossProduct(Delta.GetSafeNormal(), FVector::UpVector) * (GrooveWidth * .5);
					const int32 Base = GrooveVertices.Num();
					const FVector From = Previous[I].GetValue();
					GrooveVertices.Append({From - Across, From + Across, Point + Across, Point - Across});
					GrooveNormals.Append({FVector::UpVector, FVector::UpVector, FVector::UpVector, FVector::UpVector});
					Triangle(GrooveTriangles, GrooveVertices, Base, Base + 1, Base + 2, FVector::UpVector);
					Triangle(GrooveTriangles, GrooveVertices, Base, Base + 2, Base + 3, FVector::UpVector);
					TraceHeading[I] = Delta / Delta.Size();
					++SectionSegments;
					++Traces;
					bAdded = true;
					if (SectionSegments >= SegmentsPerSection)
					{
						FlushGrooves();
						// Past the last section the oldest is overwritten: the ice keeps the newest cuts.
						GrooveSection = (GrooveSection + 1) % MaxSections;
						GrooveVertices.Reset();
						GrooveTriangles.Reset();
						GrooveNormals.Reset();
						SectionSegments = 0;
						bAdded = false;
					}
				}
			}
			if (!bCutting)
			{
				TraceHeading[I] = FVector::ZeroVector;
			}
			if (bCutting)
			{
				Previous[I] = Point;
			}
			else
			{
				Previous[I].Reset();
			}
		}
	}
	if (bAdded)
	{
		FlushGrooves();
	}
}

void AIceRink::FlushGrooves()
{
	Grooves->CreateMeshSection_LinearColor(GrooveSection, GrooveVertices, GrooveTriangles, GrooveNormals, {}, {}, {}, false);
	Grooves->SetMaterial(GrooveSection, GrooveMaterial);
}

void AIceRink::ThrowTributes(int32 Count, const FVector& Around)
{
	if (TributeKinds.Num() == 0)
	{
		// Three bouquets (a cone of blooms) and a plush bear (a sphere), in the hall's own surface material.
		UStaticMesh* Cone = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cone.Cone"));
		UStaticMesh* Ball = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
		const TCHAR* const Colours[] = {TEXT("b0122b"), TEXT("e57aa4"), TEXT("f2efe6"), TEXT("8a5a3c")};
		for (int32 K = 0; K < 4; ++K)
		{
			UInstancedStaticMeshComponent* Kind = NewObject<UInstancedStaticMeshComponent>(this);
			Kind->SetStaticMesh(K < 3 ? Cone : Ball);
			Kind->SetupAttachment(RootComponent);
			Kind->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			Kind->SetMaterial(0, Surface(Hex(Colours[K]), .7f));
			Kind->RegisterComponent();
			TributeKinds.Add(Kind);
		}
		TributeRandom.Initialize(0xF10E);
	}
	const FVector Middle = IceSimSpace::Point(0.0, IceSimSpace::RinkCentreY);
	for (int32 I = 0; I < Count; ++I)
	{
		FTribute T;
		T.Kind = TributeRandom.RandHelper(4);
		// From somewhere in the stands: a bank, a row, a seat.
		const int32 Side = TributeRandom.RandHelper(4);
		const int32 Row = 2 + TributeRandom.RandHelper(7);
		const FRotator Bank(0, Side * 90.0, 0);
		const FVector From = Middle + Bank.RotateVector(FVector(3150 + Row * 135, TributeRandom.FRandRange(-3000.f, 3000.f), 50 + Row * 72 + 120));
		// To the ice around her, a few metres out, inside the boards.
		const float Angle = TributeRandom.FRandRange(0.f, 2.f * UE_PI);
		const float Out = TributeRandom.FRandRange(250.f, 900.f);
		FVector To = Around + FVector(FMath::Cos(Angle) * Out, FMath::Sin(Angle) * Out, 0.0);
		To.X = FMath::Clamp(To.X, Middle.X - 2500.0, Middle.X + 2500.0);
		To.Y = FMath::Clamp(To.Y, Middle.Y - 2500.0, Middle.Y + 2500.0);
		To.Z = 6.0;
		// A thrown arc that lands there: the flight's time, then the launch that makes it.
		const float Flight = TributeRandom.FRandRange(1.0f, 1.7f);
		T.At = From;
		T.Velocity = (To - From) / Flight + FVector(0.0, 0.0, 0.5 * 980.0 * Flight);
		T.Turn = FRotator(TributeRandom.FRandRange(-180.f, 180.f), TributeRandom.FRandRange(-180.f, 180.f), 0.f);
		T.Spin = FRotator(TributeRandom.FRandRange(-400.f, 400.f), TributeRandom.FRandRange(-300.f, 300.f), TributeRandom.FRandRange(-300.f, 300.f));
		Tributes.Add(T);
		const FVector Scale = T.Kind < 3 ? FVector(.10, .10, .28) : FVector(.16);
		TributeKinds[T.Kind]->AddInstance(FTransform(T.Turn, T.At, Scale), true);
	}
}

void AIceRink::StepTributes(float Dt)
{
	if (Tributes.Num() == 0)
	{
		return;
	}
	TArray<int32> Next;
	Next.SetNumZeroed(TributeKinds.Num());
	TArray<TArray<FTransform>> Placed;
	Placed.SetNum(TributeKinds.Num());
	for (FTribute& T : Tributes)
	{
		if (!T.bDown)
		{
			T.Velocity.Z -= 980.0 * Dt;
			T.At += T.Velocity * Dt;
			T.Turn += T.Spin * Dt;
			if (T.At.Z <= 6.0 && T.Velocity.Z < 0.0)
			{
				// Down on the ice, lying on its side where it fell.
				T.At.Z = 6.0;
				T.bDown = true;
				T.Turn = FRotator(T.Kind < 3 ? 90.0 : 0.0, T.Turn.Yaw, 0.0);
			}
		}
		const FVector Scale = T.Kind < 3 ? FVector(.10, .10, .28) : FVector(.16);
		Placed[T.Kind].Add(FTransform(T.Turn, T.At, Scale));
	}
	for (int32 K = 0; K < TributeKinds.Num(); ++K)
	{
		if (Placed[K].Num() > 0)
		{
			TributeKinds[K]->BatchUpdateInstancesTransforms(0, Placed[K], true, true, true);
		}
	}
}

void AIceRink::ClearTributes()
{
	Tributes.Reset();
	for (UInstancedStaticMeshComponent* Kind : TributeKinds)
	{
		Kind->ClearInstances();
	}
}

void AIceRink::Sign(const FString& Text, const FVector& At, double YawDegrees, float Size, const FColor& Colour)
{
	UTextRenderComponent* Words = NewObject<UTextRenderComponent>(this);
	Words->SetupAttachment(RootComponent);
	Words->SetText(FText::FromString(Text));
	Words->SetHorizontalAlignment(EHTA_Center);
	Words->SetVerticalAlignment(EVRTA_TextCenter);
	Words->SetWorldSize(Size);
	Words->SetTextRenderColor(Colour);
	Words->SetWorldLocationAndRotation(At, FRotator(0, YawDegrees, 0));
	Words->RegisterComponent();
}

void AIceRink::Officials(const FVector& Middle)
{
	// AUTHORED set dressing: positions in the gap between the boards (28 m) and the first row (31.5 m).
	UMaterialInstanceDynamic* Table = Surface(Hex(TEXT("1d2b3a")), .5f);
	UMaterialInstanceDynamic* Cloth = Surface(Hex(TEXT("d9bc84")), .8f);
	UMaterialInstanceDynamic* Backdrop = Surface(Hex(TEXT("23405e")), .6f);
	UMaterialInstanceDynamic* Bench = Surface(Hex(TEXT("b8c7d4")), .5f);
	// The judges' panel, mid-side on the +X bank, facing the ice.
	Box(FVector(80, 1000, 76), Middle + FVector(2930, 0, 38), 0, Table);
	Box(FVector(4, 1000, 22), Middle + FVector(2888, 0, 62), 0, Cloth, false);
	Sign(TEXT("JUDGES' PANEL"), Middle + FVector(2884, 0, 40), 180.0, 22.f, FColor(225, 205, 160));
	if (Crowd)
	{
		// Nine judges in dark suits, the referee in the middle; the crowd's shader turns their heads to her.
		for (int32 J = 0; J < 9; ++J)
		{
			const int32 I = Crowd->AddInstance(FTransform(FRotator(0, 90.0, 0), Middle + FVector(3005, (J - 4) * 105.0, 0), FVector(1.0)), true);
			const float Suit = J == 4 ? .05f : .09f;
			Crowd->SetCustomData(I, TArray<float>{Suit, Suit, Suit + .03f, .55f, .42f, .34f, (J + 1) * .097f}, true);
		}
	}
	// The kiss and cry, on the +Y bank toward a corner: a bench, a backdrop, its name.
	Box(FVector(220, 60, 45), Middle + FVector(-1200, 2960, 22.5), 0, Bench);
	Box(FVector(560, 20, 260), Middle + FVector(-1200, 3080, 130), 0, Backdrop);
	Sign(TEXT("KISS & CRY"), Middle + FVector(-1200, 3068, 200), -90.0, 46.f, FColor(240, 228, 200));
	// The event's name over the far boards' rail, for the broadcast.
	Sign(TEXT("EDGEWORK  ·  ICE RUN"), Middle + FVector(0, -2895, 70), 90.0, 34.f, FColor(200, 220, 235));
}
