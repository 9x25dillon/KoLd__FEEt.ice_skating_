#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "IceFrame.h"
#include "IceRink.generated.h"

class UProceduralMeshComponent;
class UMaterialInterface;
class UMaterialInstanceDynamic;

/** A lesson's travel target (game/tutorial.ts TutorialTarget): sim metres, a reach, a kind. */
struct FIceTarget
{
	double X = 0.0;
	double Y = 0.0;
	double R = 1.8;
	FString Kind;
	bool operator==(const FIceTarget& O) const { return X == O.X && Y == O.Y && R == O.R && Kind == O.Kind; }
};

/**
 * The sheet, its boards and the hall around it, built from the bridge
 * catalog's rink (game/rink.ts RINK: a 56 m rounded square, 9 m corners) and
 * after scripts/arena.gd's venue: concrete, raked banks, a dark roof, a grid
 * of roof fixtures. Both blades' tracings are cut into the ice as the run goes.
 */
UCLASS()
class AIceRink : public AActor
{
	GENERATED_BODY()

public:
	AIceRink();
	virtual void BeginPlay() override;

	/** Builds everything from the catalog's rink {minX,maxX,minY,maxY,corner}. */
	void Build(double MinX, double MaxX, double MinY, double MaxY, double Corner);
	/** Cuts this frame's trace samples into the ice (arena.gd add_traces). */
	void AddTraces(const TArray<FIceTraceSample>& Samples, int32 LiftedBlade);
	void ClearTraces();
	int32 TraceCount() const { return Traces; }
	/** The course on the ice for a mode: the rookie's gates and cones, the light course's lights (arena.gd set_course). */
	void SetCourse(const FString& Mode, const TSharedPtr<FJsonObject>& Catalog);
	/** The marker to make for: it glows; the rest stay dim. Past the last, it wraps (the lights do). */
	void SetTarget(int32 Index);
	/** A lesson's travel targets: rings to reach, a cone to round; the next one glows. Rebuilt only when they change. */
	void SetTutorialTargets(const TArray<FIceTarget>& Targets, int32 Next);
	/** An arrow on the ice, a little ahead of the skater, pointing at a sim-space target; hidden without one. */
	void PointArrow(const FVector& Skater, const TOptional<FVector2D>& Aim);
	/** arena.gd react: the audience rises on a landing (1 for a clean one) and settles over a few seconds. */
	void CrowdReact(double Amount);
	/** Each frame: where the skater is, for the audience's heads, and how roused the hall still is. */
	void UpdateCrowd(const FVector& SkaterAt, float Dt);

	/** The roof and its fixtures: the high Rink camera looks down through them (main.gd's roof cutaway). */
	const TArray<TWeakObjectPtr<UPrimitiveComponent>>& Roof() const { return RoofParts; }

	/** A surface of one colour; the project's parametric material when built, an engine one otherwise. */
	UMaterialInstanceDynamic* Surface(const FLinearColor& Color, float Roughness, float Metallic = 0.f, float Emissive = 0.f);

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> Sheet;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> Boards;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> Grooves;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> Markers;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> Lesson;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> Arrow;

private:
	UStaticMeshComponent* Box(const FVector& Size, const FVector& Center, double YawDegrees, UMaterialInterface* Material, bool bShadow = true);
	void RecaptureSky();
	void Lights();
	void FlushGrooves();

	UPROPERTY()
	TObjectPtr<UMaterialInterface> SurfaceBase;

	UPROPERTY()
	TObjectPtr<UMaterialInterface> IceBase;

	UPROPERTY()
	TObjectPtr<UMaterialInstanceDynamic> GrooveMaterial;

	UPROPERTY()
	TObjectPtr<class USkyLightComponent> Sky;

	/** arena.gd's audience, seated on the four banks (Content/Generated/crowd.json's spectator and M_Crowd). */
	void SeatCrowd(const FVector& Middle);
	UPROPERTY()
	TObjectPtr<class UInstancedStaticMeshComponent> Crowd;
	UPROPERTY()
	TObjectPtr<UMaterialInstanceDynamic> CrowdMaterial;
	double CrowdMood = 0.0;

	TArray<TWeakObjectPtr<UPrimitiveComponent>> RoofParts;
	TArray<TWeakObjectPtr<UPrimitiveComponent>> CourseParts;
	UPROPERTY()
	TArray<TObjectPtr<UMaterialInstanceDynamic>> MarkerMaterials;
	int32 Target = -1;
	TArray<FIceTarget> LessonTargets;
	int32 LessonNext = -1;
	TArray<TWeakObjectPtr<UPrimitiveComponent>> LessonParts;
	UPROPERTY()
	TArray<TObjectPtr<UMaterialInstanceDynamic>> LessonMaterials;
	void Ring(UProceduralMeshComponent* Mesh, int32 Section, const FVector& Centre, double Inner, double Outer, UMaterialInterface* Material);
	FTimerHandle SkyTimer;

	// The groove mesh is cut into sections so each frame rewrites only the newest.
	static constexpr int32 SegmentsPerSection = 2048;
	static constexpr int32 MaxSections = 9;
	TArray<FVector> GrooveVertices;
	TArray<int32> GrooveTriangles;
	TArray<FVector> GrooveNormals;
	int32 GrooveSection = 0;
	int32 SectionSegments = 0;
	int32 Traces = 0;
	TOptional<FVector> Previous[2];
	FVector TraceHeading[2] = {FVector::ZeroVector, FVector::ZeroVector};
};
