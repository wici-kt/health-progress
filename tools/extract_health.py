#!/usr/bin/env python3
"""Rebuild assets/data.js from an Apple Health export.

Usage:
    python3 tools/extract_health.py /path/to/export.zip
    python3 tools/extract_health.py /path/to/apple_health_export_folder

Reads export.xml once for the record summaries and once more for sleep stages
and value distributions, then writes the payload the report loads. Needs no
packages beyond the Python standard library.
"""

import datetime as dt
import json
import math
import os
import re
import shutil
import sys
import tempfile
import zipfile
from collections import Counter, defaultdict
from html import unescape

if len(sys.argv) < 2:
    sys.exit(__doc__)

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
SOURCE = os.path.abspath(os.path.expanduser(ARGS[0]))
OUT_OVERRIDE = None
if "--out" in sys.argv:
    OUT_OVERRIDE = os.path.abspath(os.path.expanduser(sys.argv[sys.argv.index("--out") + 1]))
TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = None

if os.path.isdir(SOURCE):
    EXPORT_DIR = SOURCE if os.path.basename(SOURCE) != "apple_health_export" else os.path.dirname(SOURCE)
    if not os.path.exists(os.path.join(EXPORT_DIR, "export.xml")):
        EXPORT_DIR = SOURCE
elif zipfile.is_zipfile(SOURCE):
    TEMP_DIR = tempfile.mkdtemp(prefix="health-export-")
    with zipfile.ZipFile(SOURCE) as archive:
        archive.extractall(TEMP_DIR)
    candidate = os.path.join(TEMP_DIR, "apple_health_export")
    EXPORT_DIR = candidate if os.path.isdir(candidate) else TEMP_DIR
else:
    sys.exit("Not a zip file or folder: " + SOURCE)

XML_PATH = os.path.join(EXPORT_DIR, "export.xml")
if not os.path.exists(XML_PATH):
    sys.exit("No export.xml inside " + EXPORT_DIR)

OUT_PATH = OUT_OVERRIDE or os.path.join(TOOLS_DIR, os.pardir, "data", "archive.raw.json")

ATTR_RE = re.compile(r'([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"')

# ---------------------------------------------------------------- metric map
SUM_METRICS = {
    "StepCount", "DistanceWalkingRunning", "DistanceCycling", "DistanceSwimming",
    "DistanceWheelchair", "DistanceDownhillSnowSports", "FlightsClimbed",
    "ActiveEnergyBurned", "BasalEnergyBurned", "AppleExerciseTime", "AppleStandTime",
    "AppleMoveTime", "SwimmingStrokeCount", "PushCount", "NumberOfTimesFallen",
    "NikeFuel", "TimeInDaylight",
}
CATEGORY = {
    # activity
    "StepCount": "activity", "DistanceWalkingRunning": "activity", "DistanceCycling": "activity",
    "DistanceSwimming": "activity", "FlightsClimbed": "activity", "AppleExerciseTime": "activity",
    "AppleStandTime": "activity", "AppleMoveTime": "activity", "ActiveEnergyBurned": "activity",
    "BasalEnergyBurned": "activity", "SwimmingStrokeCount": "activity", "PushCount": "activity",
    "NumberOfTimesFallen": "activity", "AppleStandHour": "activity", "TimeInDaylight": "activity",
    "DistanceWheelchair": "activity", "DistanceDownhillSnowSports": "activity",
    "NikeFuel": "activity", "Workout": "activity",
    # heart
    "HeartRate": "heart", "RestingHeartRate": "heart", "HeartRateVariabilitySDNN": "heart",
    "WalkingHeartRateAverage": "heart", "HeartRateRecoveryOneMinute": "heart",
    "Vo2Max": "heart", "AtrialFibrillationBurden": "heart", "OxygenSaturation": "vitals",
    "HighHeartRateEvent": "heart", "LowHeartRateEvent": "heart", "IrregularHeartRhythmEvent": "heart",
    "CardioFitnessMedicationsUse": "heart", "Electrocardiogram": "heart",
    # sleep
    "SleepAnalysis": "sleep", "SleepingWristTemperature": "sleep",
    "AppleSleepingWristTemperature": "sleep", "SleepingBreathingDisturbances": "sleep",
    # body
    "BodyMass": "body", "BodyMassIndex": "body", "BodyFatPercentage": "body",
    "LeanBodyMass": "body", "Height": "body", "WaistCircumference": "body",
    "Weight": "body",
    # vitals
    "BloodPressureSystolic": "vitals", "BloodPressureDiastolic": "vitals",
    "BodyTemperature": "vitals", "BasalBodyTemperature": "vitals",
    "RespiratoryRate": "respiratory", "BloodGlucose": "vitals", "InsulinDelivery": "vitals",
    "PeripheralPerfusionIndex": "vitals", "HeartRateVariability": "heart",
    # mobility
    "WalkingSpeed": "mobility", "WalkingStepLength": "mobility",
    "WalkingAsymmetryPercentage": "mobility", "WalkingDoubleSupportPercentage": "mobility",
    "StairAscentSpeed": "mobility", "StairDescentSpeed": "mobility",
    "SixMinuteWalkTestDistance": "mobility", "AppleWalkingSteadiness": "mobility",
    # hearing / environment
    "EnvironmentalAudioExposure": "hearing", "HeadphoneAudioExposure": "hearing",
    "EnvironmentalSoundReduction": "hearing", "HeadphoneAudioExposureEvent": "hearing",
    "EnvironmentalAudioExposureEvent": "hearing", "AudioExposureEvent": "hearing",
    "UVExposure": "environment", "EnvironmentalSoundLevel": "environment",
    # respiratory
    "ForcedVitalCapacity": "respiratory", "ForcedExpiratoryVolume1": "respiratory",
    "PeakExpiratoryFlowRate": "respiratory", "InhalerUsage": "respiratory",
    # reproductive
    "MenstrualFlow": "reproductive", "CervicalMucusQuality": "reproductive",
    "OvulationTestResult": "reproductive", "SexualActivity": "reproductive",
    "BasalBodyTemperatureReproductive": "reproductive",
    # mindfulness / symptoms / other
    "MindfulSession": "mindfulness", "AppleStandHourIdle": "activity",
    "ToothbrushingEvent": "dental", "HandwashingEvent": "hygiene", "Handwashing": "hygiene",
    "PhysicalEffort": "activity", "EstimatedWorkoutEffortScore": "activity",
}
CATEGORY_LABEL = {
    "activity": "Activity and movement",
    "heart": "Heart",
    "sleep": "Sleep",
    "body": "Body measurements",
    "vitals": "Vitals and labs",
    "respiratory": "Respiratory",
    "mobility": "Walking and mobility",
    "hearing": "Hearing and environment",
    "nutrition": "Nutrition and hydration",
    "mindfulness": "Mindfulness",
    "reproductive": "Cycle tracking",
    "dental": "Dental",
    "hygiene": "Hygiene",
    "symptoms": "Symptoms",
    "other": "Other",
}
PRETTY = {
    "StepCount": "Steps",
    "DistanceWalkingRunning": "Walking and running distance",
    "DistanceCycling": "Cycling distance",
    "DistanceSwimming": "Swimming distance",
    "DistanceWheelchair": "Wheelchair distance",
    "DistanceDownhillSnowSports": "Skiing and snowboarding distance",
    "FlightsClimbed": "Flights climbed",
    "ActiveEnergyBurned": "Active energy",
    "BasalEnergyBurned": "Resting energy",
    "AppleExerciseTime": "Exercise minutes",
    "AppleStandTime": "Stand minutes",
    "AppleMoveTime": "Move minutes",
    "SwimmingStrokeCount": "Swimming strokes",
    "PushCount": "Pushes",
    "NumberOfTimesFallen": "Falls",
    "NikeFuel": "NikeFuel",
    "TimeInDaylight": "Time in daylight",
    "PhysicalEffort": "Physical effort",
    "EstimatedWorkoutEffortScore": "Workout effort score",
    "HeartRate": "Heart rate",
    "RestingHeartRate": "Resting heart rate",
    "WalkingHeartRateAverage": "Walking heart rate average",
    "HeartRateVariabilitySDNN": "Heart rate variability",
    "HeartRateRecoveryOneMinute": "Heart rate recovery",
    "Vo2Max": "VO2 max",
    "OxygenSaturation": "Blood oxygen",
    "AtrialFibrillationBurden": "AFib burden",
    "HighHeartRateEvent": "High heart rate events",
    "LowHeartRateEvent": "Low heart rate events",
    "IrregularHeartRhythmEvent": "Irregular rhythm notifications",
    "SleepAnalysis": "Sleep",
    "AppleSleepingWristTemperature": "Sleeping wrist temperature",
    "SleepingWristTemperature": "Sleeping wrist temperature",
    "SleepingBreathingDisturbances": "Sleeping breathing disturbances",
    "BodyMass": "Weight",
    "Weight": "Weight",
    "BodyMassIndex": "Body mass index",
    "BodyFatPercentage": "Body fat percentage",
    "LeanBodyMass": "Lean body mass",
    "Height": "Height",
    "WaistCircumference": "Waist circumference",
    "BloodPressureSystolic": "Blood pressure (systolic)",
    "BloodPressureDiastolic": "Blood pressure (diastolic)",
    "BodyTemperature": "Body temperature",
    "BasalBodyTemperature": "Basal body temperature",
    "RespiratoryRate": "Respiratory rate",
    "BloodGlucose": "Blood glucose",
    "InsulinDelivery": "Insulin delivery",
    "PeripheralPerfusionIndex": "Perfusion index",
    "WalkingSpeed": "Walking speed",
    "WalkingStepLength": "Step length",
    "WalkingAsymmetryPercentage": "Walking asymmetry",
    "WalkingDoubleSupportPercentage": "Double support time",
    "StairAscentSpeed": "Stair ascent speed",
    "StairDescentSpeed": "Stair descent speed",
    "SixMinuteWalkTestDistance": "Six minute walk test",
    "AppleWalkingSteadiness": "Walking steadiness",
    "EnvironmentalAudioExposure": "Environmental sound levels",
    "HeadphoneAudioExposure": "Headphone sound levels",
    "EnvironmentalSoundReduction": "Environmental sound reduction",
    "EnvironmentalAudioExposureEvent": "Loud environment events",
    "HeadphoneAudioExposureEvent": "Loud headphone events",
    "AudioExposureEvent": "Loud sound events",
    "UVExposure": "UV exposure",
    "MindfulSession": "Mindful minutes",
    "ToothbrushingEvent": "Toothbrushing",
    "HandwashingEvent": "Handwashing",
    "Handwashing": "Handwashing",
    "AppleStandHour": "Stand hours",
    "MenstrualFlow": "Menstrual flow",
    "SexualActivity": "Sexual activity",
    "CervicalMucusQuality": "Cervical mucus quality",
    "OvulationTestResult": "Ovulation test",
    "DietaryEnergyConsumed": "Energy consumed",
    "DietaryProtein": "Protein",
    "DietaryFatTotal": "Fat",
    "DietaryCarbohydrates": "Carbohydrates",
    "DietaryFiber": "Fiber",
    "DietarySugar": "Sugar",
    "DietarySodium": "Sodium",
    "DietaryWater": "Water",
    "DietaryCaffeine": "Caffeine",
    "DietaryCholesterol": "Cholesterol",
    "DietaryCalcium": "Calcium",
    "DietaryIron": "Iron",
    "DietaryPotassium": "Potassium",
    "DietaryVitaminC": "Vitamin C",
    "DietaryVitaminD": "Vitamin D",
}
SYMPTOM_NAMES = {
    "HKCategoryTypeIdentifierAbdominalCramps": "Abdominal cramps",
    "HKCategoryTypeIdentifierAcne": "Acne",
    "HKCategoryTypeIdentifierAppetiteChanges": "Appetite changes",
    "HKCategoryTypeIdentifierBladderIncontinence": "Bladder incontinence",
    "HKCategoryTypeIdentifierBloating": "Bloating",
    "HKCategoryTypeIdentifierBreastPain": "Breast pain",
    "HKCategoryTypeIdentifierChestTightnessOrPain": "Chest tightness or pain",
    "HKCategoryTypeIdentifierChills": "Chills",
    "HKCategoryTypeIdentifierConstipation": "Constipation",
    "HKCategoryTypeIdentifierCoughing": "Coughing",
    "HKCategoryTypeIdentifierDiarrhea": "Diarrhea",
    "HKCategoryTypeIdentifierDizziness": "Dizziness",
    "HKCategoryTypeIdentifierDrySkin": "Dry skin",
    "HKCategoryTypeIdentifierFainting": "Fainting",
    "HKCategoryTypeIdentifierFatigue": "Fatigue",
    "HKCategoryTypeIdentifierFever": "Fever",
    "HKCategoryTypeIdentifierGeneralizedBodyAche": "Body ache",
    "HKCategoryTypeIdentifierHairLoss": "Hair loss",
    "HKCategoryTypeIdentifierHeadache": "Headache",
    "HKCategoryTypeIdentifierHeartburn": "Heartburn",
    "HKCategoryTypeIdentifierHotFlashes": "Hot flashes",
    "HKCategoryTypeIdentifierLossOfSmell": "Loss of smell",
    "HKCategoryTypeIdentifierLossOfTaste": "Loss of taste",
    "HKCategoryTypeIdentifierLowerBackPain": "Lower back pain",
    "HKCategoryTypeIdentifierMemoryLapse": "Memory lapse",
    "HKCategoryTypeIdentifierMoodChanges": "Mood changes",
    "HKCategoryTypeIdentifierNausea": "Nausea",
    "HKCategoryTypeIdentifierNightSweats": "Night sweats",
    "HKCategoryTypeIdentifierPelvicPain": "Pelvic pain",
    "HKCategoryTypeIdentifierRapidPoundingOrFlutteringHeartbeat": "Rapid heartbeat",
    "HKCategoryTypeIdentifierRunnyNose": "Runny nose",
    "HKCategoryTypeIdentifierShortnessOfBreath": "Shortness of breath",
    "HKCategoryTypeIdentifierSinusCongestion": "Sinus congestion",
    "HKCategoryTypeIdentifierSkippedHeartbeat": "Skipped heartbeat",
    "HKCategoryTypeIdentifierSleepChanges": "Sleep changes",
    "HKCategoryTypeIdentifierSoreThroat": "Sore throat",
    "HKCategoryTypeIdentifierVaginalDryness": "Vaginal dryness",
    "HKCategoryTypeIdentifierVomiting": "Vomiting",
    "HKCategoryTypeIdentifierWheezing": "Wheezing",
}

WORKOUT_NAMES = {
    "HKWorkoutActivityTypeAmericanFootball": "American football",
    "HKWorkoutActivityTypeArchery": "Archery",
    "HKWorkoutActivityTypeBadminton": "Badminton",
    "HKWorkoutActivityTypeBaseball": "Baseball",
    "HKWorkoutActivityTypeBasketball": "Basketball",
    "HKWorkoutActivityTypeBowling": "Bowling",
    "HKWorkoutActivityTypeBoxing": "Boxing",
    "HKWorkoutActivityTypeClimbing": "Climbing",
    "HKWorkoutActivityTypeCoreTraining": "Core training",
    "HKWorkoutActivityTypeCrossTraining": "Cross training",
    "HKWorkoutActivityTypeCycling": "Cycling",
    "HKWorkoutActivityTypeDance": "Dance",
    "HKWorkoutActivityTypeElliptical": "Elliptical",
    "HKWorkoutActivityTypeFencing": "Fencing",
    "HKWorkoutActivityTypeFunctionalStrengthTraining": "Functional strength training",
    "HKWorkoutActivityTypeGolf": "Golf",
    "HKWorkoutActivityTypeGymnastics": "Gymnastics",
    "HKWorkoutActivityTypeHandball": "Handball",
    "HKWorkoutActivityTypeHighIntensityIntervalTraining": "HIIT",
    "HKWorkoutActivityTypeHiking": "Hiking",
    "HKWorkoutActivityTypeHockey": "Hockey",
    "HKWorkoutActivityTypeHunting": "Hunting",
    "HKWorkoutActivityTypeJumpRope": "Jump rope",
    "HKWorkoutActivityTypeKickboxing": "Kickboxing",
    "HKWorkoutActivityTypeMartialArts": "Martial arts",
    "HKWorkoutActivityTypeMindAndBody": "Mind and body",
    "HKWorkoutActivityTypeMixedCardio": "Mixed cardio",
    "HKWorkoutActivityTypeOther": "Other",
    "HKWorkoutActivityTypePaddleSports": "Paddle sports",
    "HKWorkoutActivityTypePilates": "Pilates",
    "HKWorkoutActivityTypePlay": "Play",
    "HKWorkoutActivityTypePreparationAndRecovery": "Preparation and recovery",
    "HKWorkoutActivityTypeRacquetball": "Racquetball",
    "HKWorkoutActivityTypeRowing": "Rowing",
    "HKWorkoutActivityTypeRugby": "Rugby",
    "HKWorkoutActivityTypeRunning": "Running",
    "HKWorkoutActivityTypeSailing": "Sailing",
    "HKWorkoutActivityTypeSkatingSports": "Skating",
    "HKWorkoutActivityTypeSnowSports": "Snow sports",
    "HKWorkoutActivityTypeSoccer": "Soccer",
    "HKWorkoutActivityTypeSoftball": "Softball",
    "HKWorkoutActivityTypeSquash": "Squash",
    "HKWorkoutActivityTypeStairClimbing": "Stair climbing",
    "HKWorkoutActivityTypeStairs": "Stairs",
    "HKWorkoutActivityTypeStepTraining": "Step training",
    "HKWorkoutActivityTypeSurfingSports": "Surfing",
    "HKWorkoutActivityTypeSwimming": "Swimming",
    "HKWorkoutActivityTypeTableTennis": "Table tennis",
    "HKWorkoutActivityTypeTaiChi": "Tai chi",
    "HKWorkoutActivityTypeTennis": "Tennis",
    "HKWorkoutActivityTypeTrackAndField": "Track and field",
    "HKWorkoutActivityTypeTraditionalStrengthTraining": "Strength training",
    "HKWorkoutActivityTypeVolleyball": "Volleyball",
    "HKWorkoutActivityTypeWalking": "Walking",
    "HKWorkoutActivityTypeWaterFitness": "Water fitness",
    "HKWorkoutActivityTypeWaterPolo": "Water polo",
    "HKWorkoutActivityTypeWaterSports": "Water sports",
    "HKWorkoutActivityTypeWrestling": "Wrestling",
    "HKWorkoutActivityTypeYoga": "Yoga",
}

UNIT_LABEL = {
    "count/min": "beats per minute",
    "km/hr": "kilometres per hour",
    "m/s": "metres per second",
    "kcal/hr·kg": "kilocalories per hour per kilogram",
    "count": "count",
    "kcal": "kilocalories",
    "kJ": "kilojoules",
    "km": "kilometres",
    "mi": "miles",
    "m": "metres",
    "cm": "centimetres",
    "kg": "kilograms",
    "lb": "pounds",
    "ms": "milliseconds",
    "min": "minutes",
    "hr": "hours",
    "s": "seconds",
    "%": "percent",
    "count/hr": "count per hour",
    "mg/dL": "milligrams per decilitre",
    "mmol/L": "millimoles per litre",
    "mL/min·kg": "millilitres per minute per kilogram",
    "mL/kg/min": "millilitres per kilogram per minute",
    "kcal/hr·kg": "kilocalories per hour per kilogram",
    "cm/s": "centimetres per second",
    "dBASPL": "decibels A-weighted",
    "dBHL": "decibels hearing level",
    "L": "litres",
    "g": "grams",
    "mg": "milligrams",
    "mcg": "micrograms",
    "IU": "international units",
    "index": "index",
    "degC": "degrees Celsius",
    "degF": "degrees Fahrenheit",
}


def pretty_identifier(raw):
    """Fallback human name for any identifier we did not map by hand."""
    name = raw
    for prefix in (
        "HKQuantityTypeIdentifier", "HKCategoryTypeIdentifier", "HKDataType",
        "HKCharacteristicTypeIdentifier", "HKWorkoutActivityType",
    ):
        if name.startswith(prefix):
            name = name[len(prefix):]
    if name in PRETTY:
        return PRETTY[name]
    if raw in SYMPTOM_NAMES:
        return SYMPTOM_NAMES[raw]
    parts = re.findall(r"[A-Z][a-z]*|[0-9]+|[A-Z]+(?![a-z])", name)
    words = []
    for part in parts or [name]:
        if part.isupper() and len(part) > 1:
            words.append(part)
        else:
            words.append(part.lower())
    text = " ".join(words).strip()
    return text[:1].upper() + text[1:] if text else name


def category_for(raw):
    base = re.sub(
        r"^(HKQuantityTypeIdentifier|HKCategoryTypeIdentifier|HKDataType)", "", raw
    )
    if base in CATEGORY:
        return CATEGORY[base]
    if raw in CATEGORY:
        return CATEGORY[raw]
    if base.startswith("Dietary"):
        return "nutrition"
    if raw.startswith("HKCategoryTypeIdentifier"):
        if base in ("SleepAnalysis",):
            return "sleep"
        return "symptoms"
    if base.startswith("Heart") or base.startswith("Atrial") or base.startswith("Cardio"):
        return "heart"
    if base.startswith("Walking") or base.startswith("Stair") or base.startswith("SixMinute"):
        return "mobility"
    if base.startswith("Environmental") or base.startswith("Headphone") or base.startswith("Audio"):
        return "hearing"
    if (base.startswith("Distance") or base.startswith("Apple") or base.startswith("Running")
            or base.endswith("EnergyBurned")):
        return "activity"
    return "other"


def to_float(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


DAY_CACHE = {}


def day_index(date_text):
    """date_text like '2024-08-27 12:42:59 +0800' -> days since 2000-01-01."""
    key = date_text[:10]
    value = DAY_CACHE.get(key)
    if value is None:
        try:
            value = dt.date.fromisoformat(key).toordinal() - 730120
        except ValueError:
            value = -1
        DAY_CACHE[key] = value
    return value


def main():
    metrics = defaultdict(lambda: {
        "count": 0, "sum": 0.0, "sumsq": 0.0, "min": None, "max": None,
        "first": None, "last": None, "units": Counter(), "sources": Counter(),
        "daily_sum": defaultdict(float), "daily_n": defaultdict(int),
        "daily_min": {}, "daily_max": {}, "daily_hour": defaultdict(lambda: [0.0, 0]),
        "values": [], "categories": Counter(),
    })
    workouts = []
    activity = []
    meta = {"sources": Counter(), "devices": Counter(), "export_date": None,
            "me": {}, "records": 0, "files": {}}

    current_workout = None
    in_workout = False

    with open(XML_PATH, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not line or line[0] != " ":
                continue
            stripped = line.lstrip(" ")
            indent = len(line) - len(stripped)

            if line.startswith(" <Record "):
                attrs = dict(ATTR_RE.findall(line))
                raw_type = attrs.get("type", "")
                date_text = attrs.get("startDate", "")
                day = day_index(date_text)
                value_text = attrs.get("value", "")
                value = to_float(value_text)
                entry = metrics[raw_type]
                entry["count"] += 1
                if attrs.get("unit"):
                    entry["units"][attrs["unit"]] += 1
                entry["sources"][attrs.get("sourceName", "")] += 1
                meta["records"] += 1
                if date_text:
                    if entry["first"] is None or date_text < entry["first"]:
                        entry["first"] = date_text
                    if entry["last"] is None or date_text > entry["last"]:
                        entry["last"] = date_text
                if value is not None:
                    entry["sum"] += value
                    entry["sumsq"] += value * value
                    if entry["min"] is None or value < entry["min"]:
                        entry["min"] = value
                    if entry["max"] is None or value > entry["max"]:
                        entry["max"] = value
                elif value_text:
                    entry["categories"][value_text] += 1
                if day >= 0:
                    hours = None
                    if len(date_text) >= 13 and date_text[11:13].isdigit():
                        hours = int(date_text[11:13])
                    minute = 0
                    second = 0
                    if len(date_text) >= 19:
                        minute = int(date_text[14:16] or 0)
                        second = int(date_text[17:19] or 0)
                    if value is not None:
                        entry["daily_sum"][day] += value
                        entry["daily_n"][day] += 1
                        if hours is not None:
                            bucket = entry["daily_hour"][day * 24 + hours]
                            bucket[0] += value
                            bucket[1] += 1
                    else:
                        entry["daily_n"][day] += 1
                    if value is not None and raw_type.endswith("SleepAnalysis") is False:
                        if day not in entry["daily_min"] or value < entry["daily_min"][day]:
                            entry["daily_min"][day] = value
                        if day not in entry["daily_max"] or value > entry["daily_max"][day]:
                            entry["daily_max"][day] = value
                if len(entry["values"]) < 2000:
                    entry["values"].append([
                        date_text[:19], value if value is not None else value_text,
                        attrs.get("sourceName", ""), attrs.get("unit", ""),
                    ])
                if raw_type == "HKCategoryTypeIdentifierSleepAnalysis":
                    pass

            elif line.startswith(" <Workout "):
                attrs = dict(ATTR_RE.findall(line))
                current_workout = {
                    "type": attrs.get("workoutActivityType", ""),
                    "name": WORKOUT_NAMES.get(attrs.get("workoutActivityType", ""),
                                              pretty_identifier(attrs.get("workoutActivityType", ""))),
                    "start": attrs.get("startDate", ""),
                    "end": attrs.get("endDate", ""),
                    "duration": to_float(attrs.get("duration")),
                    "durationUnit": attrs.get("durationUnit", "min"),
                    "distance": to_float(attrs.get("totalDistance")),
                    "distanceUnit": attrs.get("totalDistanceUnit"),
                    "energy": to_float(attrs.get("totalEnergyBurned")),
                    "energyUnit": attrs.get("totalEnergyBurnedUnit"),
                    "source": attrs.get("sourceName", ""),
                    "stats": [],
                    "meta": {},
                    "events": [],
                }
                workouts.append(current_workout)
                in_workout = True

            elif in_workout and stripped.startswith("<WorkoutStatistics"):
                attrs = dict(ATTR_RE.findall(stripped))
                if current_workout is not None:
                    current_workout["stats"].append({
                        "type": attrs.get("type", ""),
                        "name": pretty_identifier(attrs.get("type", "")),
                        "average": to_float(attrs.get("average")),
                        "minimum": to_float(attrs.get("minimum")),
                        "maximum": to_float(attrs.get("maximum")),
                        "sum": to_float(attrs.get("sum")),
                        "unit": attrs.get("unit", ""),
                    })
            elif in_workout and stripped.startswith("<WorkoutEvent"):
                attrs = dict(ATTR_RE.findall(stripped))
                if current_workout is not None:
                    current_workout["events"].append({
                        "type": attrs.get("type", ""),
                        "date": attrs.get("date", ""),
                    })
            elif in_workout and stripped.startswith("<MetadataEntry"):
                attrs = dict(ATTR_RE.findall(stripped))
                key = attrs.get("key", "")
                if key and current_workout is not None:
                    current_workout["meta"][key] = attrs.get("value", "")
            elif stripped.startswith("<Workout "):
                in_workout = True
            elif line.startswith(" <Workout"):
                pass
            elif stripped.startswith("</Workout"):
                in_workout = False
                current_workout = None
            elif line.startswith(" <ActivitySummary"):
                attrs = dict(ATTR_RE.findall(line))
                activity.append({
                    "date": attrs.get("dateComponents", ""),
                    "active": to_float(attrs.get("activeEnergyBurned")),
                    "activeGoal": to_float(attrs.get("activeEnergyBurnedGoal")),
                    "exercise": to_float(attrs.get("appleExerciseTime")),
                    "exerciseGoal": to_float(attrs.get("appleExerciseTimeGoal")),
                    "stand": to_float(attrs.get("appleStandHours")),
                    "standGoal": to_float(attrs.get("appleStandHoursGoal")),
                    "moveTime": to_float(attrs.get("appleMoveTime")),
                })
            elif line.startswith(" <ExportDate"):
                attrs = dict(ATTR_RE.findall(line))
                meta["export_date"] = attrs.get("value", "")
            elif line.startswith(" <Me "):
                attrs = dict(ATTR_RE.findall(line))
                meta["me"] = {
                    "dob": attrs.get("HKCharacteristicTypeIdentifierDateOfBirth", ""),
                    "sex": attrs.get("HKCharacteristicTypeIdentifierBiologicalSex", ""),
                    "blood": attrs.get("HKCharacteristicTypeIdentifierBloodType", ""),
                    "skin": attrs.get("HKCharacteristicTypeIdentifierFitzpatrickSkinType", ""),
                    "meds": attrs.get("HKCharacteristicTypeIdentifierCardioFitnessMedicationsUse", ""),
                }
            elif indent == 1 and stripped.startswith("<Record"):
                pass

    print("parsed xml", flush=True)

    # Newer exports omit totalDistance / totalEnergyBurned from the Workout
    # element and keep them in child WorkoutStatistics instead.
    for workout in workouts:
        if workout["distance"] is None:
            total = 0.0
            unit = None
            for stat in workout["stats"]:
                if stat["type"].startswith("HKQuantityTypeIdentifierDistance") or \
                        stat["type"].endswith("SwimmingStrokeCount"):
                    if stat["sum"]:
                        total += stat["sum"]
                        unit = stat["unit"]
            if total:
                workout["distance"] = total
                workout["distanceUnit"] = unit
        if workout["energy"] is None:
            total = 0.0
            unit = None
            for stat in workout["stats"]:
                if stat["type"] == "HKQuantityTypeIdentifierActiveEnergyBurned" and stat["sum"]:
                    total += stat["sum"]
                    unit = stat["unit"]
            if total:
                workout["energy"] = total
                workout["energyUnit"] = unit
        for stat in workout["stats"]:
            if stat["type"] == "HKQuantityTypeIdentifierHeartRate":
                workout["hrAvg"] = stat["average"]
                workout["hrMin"] = stat["minimum"]
                workout["hrMax"] = stat["maximum"]

    # ---------------------- second pass: sleep nights and value distributions
    BINS = 48
    hist_bins = {}
    for raw, entry in metrics.items():
        if entry["units"] and entry["min"] is not None and entry["max"] is not None:
            hist_bins[raw] = [0] * BINS

    nights = {}
    with open(XML_PATH, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not line.startswith(" <Record "):
                continue
            attrs = dict(ATTR_RE.findall(line))
            raw_type = attrs.get("type", "")
            value = to_float(attrs.get("value", ""))
            bins = hist_bins.get(raw_type)
            if bins is not None and value is not None:
                span = metrics[raw_type]["max"] - metrics[raw_type]["min"]
                if span <= 0:
                    bins[0] += 1
                else:
                    index = int((value - metrics[raw_type]["min"]) / span * (BINS - 1))
                    bins[min(BINS - 1, max(0, index))] += 1
            if not raw_type.endswith("SleepAnalysis"):
                continue
            start = attrs.get("startDate", "")
            end = attrs.get("endDate", "")
            if not start or not end:
                continue
            try:
                start_dt = dt.datetime.strptime(start[:19], "%Y-%m-%d %H:%M:%S")
                end_dt = dt.datetime.strptime(end[:19], "%Y-%m-%d %H:%M:%S")
            except ValueError:
                continue
            night_key = (start_dt - dt.timedelta(hours=12)).date().isoformat()
            bucket = nights.setdefault(night_key, {
                "date": night_key, "inBed": 0.0, "asleep": 0.0, "core": 0.0,
                "deep": 0.0, "rem": 0.0, "awake": 0.0, "unspecified": 0.0,
                "start": None, "end": None, "source": attrs.get("sourceName", ""),
                "segments": 0,
            })
            minutes = (end_dt - start_dt).total_seconds() / 60.0
            if minutes <= 0 or minutes > 24 * 60:
                continue
            stage = attrs.get("value", "")
            bucket["segments"] += 1
            if stage.endswith("InBed"):
                bucket["inBed"] += minutes
            elif stage.endswith("AsleepCore") or stage.endswith("Asleep"):
                bucket["core"] += minutes
                bucket["asleep"] += minutes
            elif stage.endswith("AsleepDeep"):
                bucket["deep"] += minutes
                bucket["asleep"] += minutes
            elif stage.endswith("AsleepREM"):
                bucket["rem"] += minutes
                bucket["asleep"] += minutes
            elif stage.endswith("AsleepUnspecified"):
                bucket["unspecified"] += minutes
                bucket["asleep"] += minutes
            elif stage.endswith("Awake"):
                bucket["awake"] += minutes
            if bucket["start"] is None or start < bucket["start"]:
                bucket["start"] = start
            if bucket["end"] is None or end > bucket["end"]:
                bucket["end"] = end
    print("parsed sleep and distributions", flush=True)

    # ------------------------------------------------------------------ routes
    routes = []
    route_dir = os.path.join(EXPORT_DIR, "workout-routes")
    if os.path.isdir(route_dir):
        for name in sorted(os.listdir(route_dir)):
            if not name.endswith(".gpx"):
                continue
            path = os.path.join(route_dir, name)
            points = []
            with open(path, "r", encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    if "<trkpt " not in line:
                        continue
                    lat = re.search(r'lat="([-0-9.]+)"', line)
                    lon = re.search(r'lon="([-0-9.]+)"', line)
                    if not lat or not lon:
                        continue
                    ele = re.search(r"<ele>([-0-9.]+)</ele>", line)
                    when = re.search(r"<time>([^<]+)</time>", line)
                    points.append((
                        float(lat.group(1)), float(lon.group(1)),
                        float(ele.group(1)) if ele else None,
                        when.group(1) if when else None,
                    ))
            if not points:
                continue
            distance = 0.0
            gain = 0.0
            for i in range(1, len(points)):
                lat1, lon1, ele1, _ = points[i - 1]
                lat2, lon2, ele2, _ = points[i]
                dlat = math.radians(lat2 - lat1)
                dlon = math.radians(lon2 - lon1)
                a = (math.sin(dlat / 2) ** 2
                     + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
                     * math.sin(dlon / 2) ** 2)
                distance += 2 * 6371000 * math.asin(math.sqrt(a))
                if ele1 is not None and ele2 is not None and ele2 > ele1:
                    gain += ele2 - ele1
            lats = [p[0] for p in points]
            lons = [p[1] for p in points]
            step = max(1, len(points) // 220)
            simplified = [
                [round(points[i][0], 5), round(points[i][1], 5)]
                for i in range(0, len(points), step)
            ]
            if simplified[-1] != [round(points[-1][0], 5), round(points[-1][1], 5)]:
                simplified.append([round(points[-1][0], 5), round(points[-1][1], 5)])
            start_time = points[0][3]
            end_time = points[-1][3]
            routes.append({
                "file": name,
                "date": name.split("_")[1] if "_" in name else "",
                "points": len(points),
                "distance": round(distance),
                "gain": round(gain),
                "start": start_time,
                "end": end_time,
                "degenerate": len(points) < 2 or (max(lats) - min(lats) < 1e-5 and max(lons) - min(lons) < 1e-5),
                "bbox": [min(lats), min(lons), max(lats), max(lons)],
                "path": simplified,
            })
        meta["files"]["routes"] = len(routes)

    print("parsed routes", flush=True)

    # -------------------------------------------------------------------- ecg
    ecgs = []
    ecg_dir = os.path.join(EXPORT_DIR, "electrocardiograms")
    if os.path.isdir(ecg_dir):
        for name in sorted(os.listdir(ecg_dir)):
            if not name.endswith(".csv"):
                continue
            header = {}
            samples = []
            with open(os.path.join(ecg_dir, name), "r", encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    if "," in line:
                        key, _, rest = line.partition(",")
                        header[key.strip()] = rest.strip().strip('"')
                        continue
                    # Apple writes the waveform as one microvolt value per line,
                    # with no timestamp column once the header ends.
                    try:
                        samples.append(float(line))
                    except ValueError:
                        continue
            step = max(1, len(samples) // 1400)
            ecgs.append({
                "file": name,
                "name": header.get("Name", ""),
                "recorded": header.get("Recorded Date", ""),
                "classification": header.get("Classification", ""),
                "symptoms": header.get("Symptoms", ""),
                "software": header.get("Software Version", ""),
                "device": header.get("Device", ""),
                "rate": header.get("Sample Rate", ""),
                "lead": header.get("Lead", ""),
                "unit": header.get("Unit", "\u00b5V"),
                "samples": len(samples),
                # microvolts to millivolts
                "trace": [round(samples[i] / 1000.0, 5) for i in range(0, len(samples), step)],
            })
        meta["files"]["ecg"] = len(ecgs)

    print("parsed ecg", flush=True)

    # ------------------------------------------------------------ metric shape
    out_metrics = {}
    for raw, entry in metrics.items():
        base = re.sub(
            r"^(HKQuantityTypeIdentifier|HKCategoryTypeIdentifier|HKDataType)", "", raw
        )
        unit = entry["units"].most_common(1)[0][0] if entry["units"] else ""
        days = sorted(entry["daily_sum"].keys()) if entry["daily_sum"] else sorted(entry["daily_n"].keys())
        daily = {
            "d": days,
            "s": [round(entry["daily_sum"].get(d, 0.0), 4) for d in days],
            "n": [entry["daily_n"].get(d, 0) for d in days],
            "mn": [round(entry["daily_min"][d], 4) if d in entry["daily_min"] else None for d in days],
            "mx": [round(entry["daily_max"][d], 4) if d in entry["daily_max"] else None for d in days],
        }
        hours = [0.0] * 24
        hour_n = [0] * 24
        for key, bucket in entry["daily_hour"].items():
            hour = key % 24
            hours[hour] += bucket[0]
            hour_n[hour] += bucket[1]
        count = entry["count"]
        # Apple stores some percentages as 0-1 fractions while labelling them "%".
        # Normalise those to 0-100 so every percentage on the site reads the same way.
        scale = 1.0
        if (unit == "%" and entry["max"] is not None and entry["min"] is not None
                and 0 <= entry["min"] and entry["max"] <= 1.0001):
            scale = 100.0
        if scale != 1.0:
            daily["s"] = [round(v * scale, 4) for v in daily["s"]]
            daily["mn"] = [None if v is None else round(v * scale, 4) for v in daily["mn"]]
            daily["mx"] = [None if v is None else round(v * scale, 4) for v in daily["mx"]]
            hours = [v * scale for v in hours]
            entry["values"] = [
                [v[0], round(v[1] * scale, 4) if isinstance(v[1], float) else v[1], v[2], v[3]]
                for v in entry["values"]
            ]
        out_metrics[raw] = {
            "id": raw,
            "base": base,
            "name": pretty_identifier(raw),
            "category": category_for(raw),
            "unit": unit,
            "unitLabel": UNIT_LABEL.get(unit, unit),
            "count": count,
            "first": (entry["first"] or "")[:19],
            "last": (entry["last"] or "")[:19],
            "min": round(entry["min"] * scale, 4) if entry["min"] is not None else None,
            "max": round(entry["max"] * scale, 4) if entry["max"] is not None else None,
            "sum": round(entry["sum"] * scale, 4) if count else None,
            "mean": round(entry["sum"] / count * scale, 4) if count and entry["units"] else None,
            "sd": round(math.sqrt(max(0.0, entry["sumsq"] / count - (entry["sum"] / count) ** 2)) * scale, 4)
            if count > 1 and entry["units"] else None,
            "sources": dict(entry["sources"].most_common()),
            "categories": dict(entry["categories"].most_common()),
            "aggregation": "sum" if base in SUM_METRICS else "mean",
            "daily": daily,
            "hours": hours,
            "hourN": hour_n,
            "hist": hist_bins.get(raw),
            "histMin": round((entry["min"] or 0) * scale, 4),
            "histMax": round((entry["max"] or 0) * scale, 4),
            "values": entry["values"] if count <= 2000 else [],
            "valueSample": entry["values"][:300] if count > 2000 else [],
        }
        for source in entry["sources"]:
            meta["sources"][source] += entry["sources"][source]

    payload = {
        "generated": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "epoch": "2000-01-01",
        "meta": {
            "exportDate": meta["export_date"],
            "me": meta["me"],
            "records": meta["records"],
            "workoutCount": len(workouts),
            "activityDays": len(activity),
            "routeCount": len(routes),
            "ecgCount": len(ecgs),
            "metricCount": len(out_metrics),
            "sources": dict(meta["sources"].most_common()),
            "files": meta["files"],
        },
        "metrics": out_metrics,
        "categoryLabels": CATEGORY_LABEL,
        "nights": sorted(nights.values(), key=lambda n: n["date"]),
        "workouts": workouts,
        "activity": activity,
        "routes": routes,
        "ecgs": ecgs,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"), ensure_ascii=False)

    if TEMP_DIR:
        shutil.rmtree(TEMP_DIR, ignore_errors=True)

    size = os.path.getsize(OUT_PATH) / 1e6
    print(f"wrote {OUT_PATH} ({size:.1f} MB)")
    print("metrics:", len(out_metrics), "workouts:", len(workouts),
          "activity days:", len(activity), "nights:", len(nights),
          "routes:", len(routes), "ecgs:", len(ecgs))
    top = sorted(out_metrics.values(), key=lambda m: -m["count"])[:25]
    for m in top:
        print(f"  {m['count']:>8}  {m['name']}  [{m['unit']}]  {m['first'][:10]}..{m['last'][:10]}")


if __name__ == "__main__":
    main()
