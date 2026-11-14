# ASTRA 20 Simulation & Clinical Test Cases Manual
## دليل حالات الاختبار الـ 20 والمحاكاة السريرية الشاملة (English & العربية)

This document provides 20 end-to-end operational, physical, and medical test cases for demonstrations, exhibitions, and technical evaluations of the **ASTRA Astronaut Health Monitoring & Mars Mission Simulation**.

---

## Architecture Flow: Sensor ➔ TDL ➔ ML Decision Engine
```
┌─────────────────────────────────┐
│     Physical Transducers        │  (Pt100 RTD, Piezoresistive Diaphragm, Silicon PIN Diode,
│   (Body Nodes & Spacesuit)      │   Pulse Oximeter, Capnometer, Chest Strain Band)
└────────────────┬────────────────┘
                 │ Raw signals (mV, Ω, photocurrent, counts)
                 ▼
┌─────────────────────────────────┐
│    Environmental Coupling       │  Mars ambient: -60°C to 0°C, 610 Pa CO2 atmosphere,
│     & Fault Injection           │  solar ionizing radiation, dust deposition, vibration
└────────────────┬────────────────┘
                 │ Perturbed / Faulty Telemetry
                 ▼
┌─────────────────────────────────┐
│    Trusted Data Layer (TDL)     │  1. Computes residual: ε(t) = |y_obs(t) - y_true(t)|
│   Integrity & Trust Scoring     │  2. Evaluates datasheet tolerance & drift bounds
│                                 │  3. Yields Trust Score: S_trust ∈ [0.0, 1.0]
└────────────────┬────────────────┘
                 │ Trust-Weighted Telemetry Vector: x ⊙ S_trust
                 ▼
┌─────────────────────────────────┐
│       Machine Learning          │  Random Forest & Gradient-Boosted Decision Trees
│     Medical Decision Engine     │  Classifies: NOMINAL | HEAT_EXHAUSTION | HYPOXIA |
│                                 │  HYPERCAPNIA | DECOMPRESSION_RISK | SENSOR_ARTIFACT
└────────────────┬────────────────┘
                 │ Autonomous Clinical Diagnosis & NASA-STD-3001 Citation
                 ▼
┌─────────────────────────────────┐
│  Autonomous Crew Intervention   │  During Earth Communication Blackout (LOS / 14-22m delay):
│   (Crew Doctor & Astronaut)     │  Triggers SOP oxygen, makeup gas, LCVG cooling, or shelter
└─────────────────────────────────┘
```

---

## The 20 Test & Simulation Cases (حالات الاختبار العشرين)

### Case 1: SpO2 Motion Artifact vs. True Hypoxia (منع الإنذار الكاذب لمستشعر الأكسجين)
- **English**:
  - **Scenario**: Astronaut climbs a rocky Jezero slope; optical finger probe shifts.
  - **Raw Telemetry**: SpO2 drops to 64.0%. Heart Rate = 72 bpm, Respiration = 14 bpm.
  - **TDL Analysis**: Photoplethysmogram AC/DC ratio abnormal. Residual $\epsilon = 34.0\%$. Trust Score $S_{trust} = 0.16$ (SUPPRESSED).
  - **ML Decision**: `SENSOR_ARTIFACT_FALSE_ALARM` (Confidence: 88%).
  - **Intervention**: Suppress emergency oxygen purge. Prompt astronaut to re-seat finger cuff. False alarm prevented.
- **العربية**:
  - **السيناريو**: أثناء تسلق منحدر صخري، تحرك مجس قياس الأكسجين البصري من مكانه.
  - **البيانات المقاسة**: قراءة الأكسجين 64% (مؤشر خطير ظاهرياً)، بينما نبض القلب 72 ن/د والتنفس 14 ن/د.
  - **تحليل طبقة الموثوقية (TDL)**: رصد انحراف شديد بالموجة الضوئية. درجة الموثوقية 16% (إشارة معزولة).
  - **قرار الذكاء الاصطناعي**: تصنيف الحالة كخلل بمستشعر `SENSOR_ARTIFACT_FALSE_ALARM` بثقة 88%.
  - **الإجراء الطبي**: منع الهلع وإيقاف التحويل الطارئ للأكسجين، وتوجيه الرائد لتثبيت المشبك.

---

### Case 2: Acute Hypoxia from Primary O2 Loop Restriction (نقص أكسجة حاد حقيقي)
- **English**:
  - **Scenario**: Spacesuit primary oxygen regulator restricts flow.
  - **Raw Telemetry**: SpO2 = 81.5%, Heart Rate = 132 bpm, Respiration = 29 bpm, Suit Pressure = 29.5 kPa.
  - **TDL Analysis**: Residual $\epsilon = 0.8\%$. Cross-sensor correlation verified. Trust Score $S_{trust} = 0.96$ (VALIDATED).
  - **ML Decision**: `HYPOXIA` (Critical, Confidence: 94%).
  - **Intervention**: NASA-STD-3001 §6.2.1: Autonomous SOP (Secondary Oxygen Pack) activation. Immediate EVA abort.
- **العربية**:
  - **السيناريو**: انسداد جزئي في مسار منظم الأكسجين الرئيسي في حقيبة الظهر (PLSS).
  - **البيانات المقاسة**: الأكسجين 81.5%، النبض 132 ن/د، التنفس 29 ن/د، ضغط البذلة 29.5 كيلو باسكال.
  - **تحليل TDL**: القراءة دقيقة ومتطابقة مع تسارع التنفس والنبض. الموثوقية 96% (مؤكدة).
  - **قرار الذكاء الاصطناعي**: نقص أكسجة حاد `HYPOXIA` بدرجة خطورة قصوى (ثقة 94%).
  - **الإجراء الطبي**: تفعيل حزمة الأكسجين الثانوية SOP فوراً وإلغاء مهمة السير الخارجي فوراً.

---

### Case 3: Spacesuit Micrometeorite Puncture Breach (تسرب ضغط البذلة بنيزك دقيق)
- **English**:
  - **Scenario**: Micrometeorite penetrates outer suit layer near upper torso.
  - **Raw Telemetry**: Suit Pressure drops from 29.6 kPa to 22.4 kPa (-1.4 kPa/min). HR = 145 bpm.
  - **TDL Analysis**: Piezoresistive bridge output valid. Trust Score $S_{trust} = 0.98$ (VALIDATED).
  - **ML Decision**: `DECOMPRESSION_RISK` (Critical, Confidence: 97%).
  - **Intervention**: NASA-STD-3001 §6.1.1: Automatic high-pressure makeup gas injection. Immediate emergency repressurization.
- **العربية**:
  - **السيناريو**: اختراق نيزك دقيق لطبقة البذلة الخارجية عند الجذع العلوي.
  - **البيانات المقاسة**: انخفاض ضغط البذلة إلى 22.4 كيلو باسكال بمعدل انحدار سريع. تسارع النبض إلى 145 ن/د.
  - **تحليل TDL**: سلامة قراءة حساس الضغط السيليكوني. الموثوقية 98% (مؤكدة).
  - **قرار الذكاء الاصطناعي**: خطر انخفاض الضغط الحاد `DECOMPRESSION_RISK` (ثقة 97%).
  - **الإجراء الطبي**: حقن غاز التعويض عالي الضغط بالبذلة والتوجه بأقصى سرعة لحجرة الضغط.

---

### Case 4: Core Temperature RTD Calibration Drift (انحراف تدريجي لمستشعر الحرارة)
- **English**:
  - **Scenario**: RTD Wheatstone bridge resistor experiences thermal drift (+0.15 Ω/min).
  - **Raw Telemetry**: Core Temp reads 43.1°C (lethal). Heart Rate = 74 bpm, Skin Temp = 36.8°C.
  - **TDL Analysis**: Violation of physical physiological thermal rate of change limit. Trust Score $S_{trust} = 0.19$ (SUPPRESSED).
  - **ML Decision**: `SENSOR_ARTIFACT_FALSE_ALARM` (Confidence: 85%).
  - **Intervention**: Inhibit invasive medical cooling protocols. Flag RTD sensor for post-EVA recalibration.
- **العربية**:
  - **السيناريو**: انحراف تدريجي بمقاومة قنطرة وتستون لمستشعر الحرارة المركزي (RTD).
  - **البيانات المقاسة**: الحرارة المركزية تسجل 43.1 مئوية (قاتلة ظاهرياً)، بينما نبض القلب 74 وحرارة الجلد 36.8 مئوية.
  - **تحليل TDL**: تجاوز الحد الأقصى الفيزيائي لمعدل تغير حرارة الجسم. الموثوقية 19% (عطل مستشعر).
  - **قرار الذكاء الاصطناعي**: إنذار كاذب `SENSOR_ARTIFACT_FALSE_ALARM` (ثقة 85%).
  - **الإجراء الطبي**: إلغاء بروتوكول التبريد الحرج، وحفظ تقرير لفحص ومعايرة المستشعر لاحقاً.

---

### Case 5: Real EVA Core Body Hyperthermia / Heat Exhaustion (إجهاد حراري حقيقي)
- **English**:
  - **Scenario**: LCVG (Liquid Cooling Garment) water loop pump blockage during high metabolic traverse.
  - **Raw Telemetry**: Core Temp = 39.1°C, Heart Rate = 162 bpm, Resp Rate = 28 bpm.
  - **TDL Analysis**: Thermal progression matches metabolic expenditure. Trust Score $S_{trust} = 0.95$ (VALIDATED).
  - **ML Decision**: `HEAT_EXHAUSTION` (Warning, Confidence: 93%).
  - **Intervention**: NASA-STD-3001 §6.5.2: Increase cooling loop flow to maximum; halt EVA traversal in shaded boulder zone.
- **العربية**:
  - **السيناريو**: انسداد في مضخة مياه سترة التبريد السائل (LCVG) أثناء المشي في أرض وعرة.
  - **البيانات المقاسة**: الحرارة المركزية 39.1 مئوية، نبض القلب 162 ن/د، التنفس 28 ن/د.
  - **تحليل TDL**: التدرج الحراري متطابق مع الجهد العضلي واستهلاك الطاقة. الموثوقية 95% (مؤكدة).
  - **قرار الذكاء الاصطناعي**: إجهاد حراري مركزي حاد `HEAT_EXHAUSTION` (ثقة 93%).
  - **الإجراء الطبي**: زيادة تدفق التبريد للحد الأقصى، وإيقاف رائد الفضاء فوراً للاستراحة في منطقة ظل.

---

### Case 6: Amine Scrubber Breakthrough / Hypercapnia (فرط ثاني أكسيد الكربون)
- **English**:
  - **Scenario**: CO2 amine scrubber bed saturation.
  - **Raw Telemetry**: Inspired CO2 = 9.4 mmHg (NASA limit <5.0 mmHg). Respiration = 32 bpm, HR = 120 bpm.
  - **TDL Analysis**: NDIR infrared capnometer optical path clean. Trust Score $S_{trust} = 0.97$ (VALIDATED).
  - **ML Decision**: `HYPERCAPNIA` (Warning, Confidence: 92%).
  - **Intervention**: NASA-STD-3001 §6.2.2: Cycle secondary amine bed; instruct astronaut to pace respirations; abort EVA if CO2 > 10 mmHg.
- **العربية**:
  - **السيناريو**: تشبع مرشحات الأمين الماصة لثاني أكسيد الكربون في دورة تنفس البذلة.
  - **البيانات المقاسة**: تركيز CO2 يصل إلى 9.4 ملم زئبق (الحد المسموح <5)، التنفس 32 ن/د، النبض 120 ن/د.
  - **تحليل TDL**: المسار البصري لمستشعر NDIR سليم. الموثوقية 97% (مؤكدة).
  - **قرار الذكاء الاصطناعي**: فرط ثاني أكسيد الكربون المستنشق `HYPERCAPNIA` (ثقة 92%).
  - **الإجراء الطبي**: تفعيل المرشح الاحتياطي، توجيه الرائد بتهدئة وتيرة التنفس، وإنهاء السير إذا تجاوز 10.

---

### Case 7: Solar Particle Event (SPE) Radiation Storm (عاصفة جزيئات شمسية وإشعاع)
- **English**:
  - **Scenario**: Coronal mass ejection hits Mars surface during daytime EVA.
  - **Raw Telemetry**: Silicon dosimeter ionization rate = 1480 $\mu\text{Sv/h}$ (53× background).
  - **TDL Analysis**: Dosimeter PIN diode reverse bias leakage verified. Trust Score $S_{trust} = 0.95$ (VALIDATED).
  - **ML Decision**: `RADIATION_EVENT` (Warning, Confidence: 96%).
  - **Intervention**: Order immediate geologic shelter (crater wall / lava tube); orient water backpack toward sun.
- **العربية**:
  - **السيناريو**: انبعاث إكليلي شمسي (CME) يصل لسطح المريخ أثناء سير الرواد بالخارج.
  - **البيانات المقاسة**: مقياس الجرعات الإشعاعية يسجل 1480 ميكروسيفرت/ساعة (53 ضعف المعدل الطبيعي).
  - **تحليل TDL**: قراءة المستشعر متسقة مع الانحياز العكسي للديود. الموثوقية 95% (مؤكدة).
  - **قرار الذكاء الاصطناعي**: عاصفة إشعاعية شمسية `RADIATION_EVENT` (ثقة 96%).
  - **الإجراء الطبي**: توجيه الطاقم فوراً للاحتماء بكهف بركاني أو حافة جرف، وتوجيه حقيبة المياه نحو الشمس كدرع.

---

### Case 8: ECG Lead Disconnection vs. Ventricular Tachycardia (انفصال قطب القلب والنبض الكاذب)
- **English**:
  - **Scenario**: Chest ECG wet-gel lead lifts due to perspiration.
  - **Raw Telemetry**: Heart Rate reads 220 bpm (ventricular tachycardia apparent). SpO2 = 98%, Resp = 15 bpm.
  - **TDL Analysis**: 50/60Hz electromagnetic interference (EMI) detected. High impedance flag. Trust Score $S_{trust} = 0.12$.
  - **ML Decision**: `SENSOR_ARTIFACT_FALSE_ALARM` (Confidence: 89%).
  - **Intervention**: Inhibit defibrillator / antiarrhythmic drug alerts. Instruct astronaut to re-press chest biosensor band.
- **العربية**:
  - **السيناريو**: انفصال قطب تخطيط القلب بالصدر بسبب التعرق والحركة.
  - **البيانات المقاسة**: قراءة النبض تقفز لـ 220 ن/د (تسارع بطيني خطير ظاهرياً)، بينما الأكسجين 98% والتنفس 15.
  - **تحليل TDL**: رصد تشويش كهرومغناطيسي ومقاومة تلامس مرتفعة جداً. الموثوقية 12% (عطل مستشعر).
  - **قرار الذكاء الاصطناعي**: إنذار كاذب `SENSOR_ARTIFACT_FALSE_ALARM` (ثقة 89%).
  - **الإجراء الطبي**: منع الإنذار الطبي الصادم وتوجيه رائد الفضاء لإعادة الضغط على حزام الصدر.

---

### Case 9: Piezoresistive Pressure Zero-Offset Stuck Fault (عطل تجمد قراءة مستشعر الضغط)
- **English**:
  - **Scenario**: Transducer ADC converter freezes on constant value (29.600 kPa).
  - **Raw Telemetry**: Suit Pressure variance = 0.0000 kPa over 60 seconds of walking.
  - **TDL Analysis**: Stuck-at fault detected by zero-entropy metric. Trust Score $S_{trust} = 0.05$ (SUPPRESSED).
  - **ML Decision**: `SENSOR_ARTIFACT_FALSE_ALARM` (Confidence: 91%).
  - **Intervention**: Switch flight display to redundant secondary pressure transducer. Log transducer reset command.
- **العربية**:
  - **السيناريو**: تجمد محول الإشارة الرقمي لمستشعر الضغط على قيمة ثابتة (29.600 كيلو باسكال).
  - **البيانات المقاسة**: تباين قراءة الضغط صفر تماماً طوال 60 ثانية أثناء الحركة.
  - **تحليل TDL**: اكتشاف عطل تجمد القراءة (Stuck-at). درجة الموثوقية 5% (عزل المستشعر).
  - **قرار الذكاء الاصطناعي**: عطل مستشعر `SENSOR_ARTIFACT_FALSE_ALARM` (ثقة 91%).
  - **الإجراء الطبي**: التحويل التلقائي للقراءة إلى مستشعر الضغط الثانوي الاحتياطي وإعادة تهيئة المحول.

---

### Case 10: Earth Communication Blackout with Stable Vitals (انقطاع الاتصال مع استقرار المؤشرات)
- **English**:
  - **Scenario**: Mars orbital relay satellite passes behind horizon; Loss of Signal (LOS) for 45 minutes.
  - **Raw Telemetry**: All vitals nominal (HR 72, SpO2 98.4%, Core 37.0°C, Suit 29.5 kPa).
  - **TDL Analysis**: All sensor trust scores >0.95.
  - **ML Decision**: `NOMINAL` with autonomous monitoring active.
  - **Intervention**: Flight Surgeon AI maintains quiet background cadence; displays countdown to next Earth acquisition.
- **العربية**:
  - **السيناريو**: غياب قمر التتابع المداري خلف الأفق وانقطاع الإشارة مع الأرض لمدة 45 دقيقة.
  - **البيانات المقاسة**: كافة المؤشرات طبيعية تماماً (النبض 72، الأكسجين 98.4%، الحرارة 37، الضغط 29.5).
  - **تحليل TDL**: موثوقية ممتازة لكافة المستشعرات تتجاوز 95%.
  - **قرار الذكاء الاصطناعي**: حالة فسيولوجية طبيعية ومستقرة `NOMINAL` مع تفعيل وضع المراقبة الذاتية.
  - **الإجراء الطبي**: استمرار المهمة بهدوء وعرض عداد تنازلي لموعد عودة الاتصال بالأرض.

---

### Case 11: Hypothermia in Mars Polar Shaded Traverse (انخفاض حرارة الجسم بمنطقة مظللة)
- **English**:
  - **Scenario**: 90-minute traverse in permanent crater shadow; LCVG cooling bypass stuck open.
  - **Raw Telemetry**: Core Temp = 35.1°C, Shivering-induced muscle artifact on ECG, HR = 110 bpm.
  - **TDL Analysis**: Temperature decay matches convective losses. Trust Score $S_{trust} = 0.94$.
  - **ML Decision**: `HYPOTHERMIA` (Warning, Confidence: 91%).
  - **Intervention**: Command LCVG electric heating elements to engage. Move astronaut into direct sunlight.
- **العربية**:
  - **السيناريو**: مسير طويل في ظل فوهة جيزيرو مع بقاء صمام التبريد مفتوحاً.
  - **البيانات المقاسة**: انخفاض الحرارة المركزية إلى 35.1 مئوية، رعشة عضلية على تخطيط القلب، تسارع النبض إلى 110.
  - **تحليل TDL**: هبوط الحرارة يتوافق مع الفقد الحراري الإشعاعي للمريخ. الموثوقية 94%.
  - **قرار الذكاء الاصطناعي**: انخفاض حرارة الجسم `HYPOTHERMIA` (ثقة 91%).
  - **الإجراء الطبي**: تشغيل عناصر التدفئة الكهربائية بالبذلة فوراً وتوجيه الرائد لمنطقة مشمسة.

---

### Case 12: High-Altitude Suit Pressure Excursion on Crater Rim (انخفاض الضغط على قمة التضاريس)
- **English**:
  - **Scenario**: Traversal to high crater rim (+340 m MOLA elevation).
  - **Raw Telemetry**: Ambient pressure drops from 680 Pa to 540 Pa. Suit differential regulator compensates.
  - **TDL Analysis**: Suit differential pressure delta = 29.5 kPa nominal. Trust Score $S_{trust} = 0.98$.
  - **ML Decision**: `NOMINAL` (Regulator correctly compensating).
  - **Intervention**: Verify suit delta-P relief valve is within nominal hysteresis.
- **العربية**:
  - **السيناريو**: صعود الرائد إلى حافة الفوهة المرتفعة (+340 م عن منسوب الهبوط).
  - **البيانات المقاسة**: هبوط الضغط الجوي الخارجي إلى 540 باسكال، مع تعويض منظم البذلة الداخلي.
  - **تحليل TDL**: ضغط البذلة التفاضلي مستقر عند 29.5 كيلو باسكال. الموثوقية 98%.
  - **قرار الذكاء الاصطناعي**: توازن طبيعي `NOMINAL` وكفاءة منظم الضغط.
  - **الإجراء الطبي**: الاستمرار الطبيعي في مسار المهمة.

---

### Case 13: Transient Radiation Spike from Galactic Cosmic Ray (نبضة إشعاع كونية عابرة)
- **English**:
  - **Scenario**: High-energy heavy iron ion (HZE) deposits energy in sensor diode.
  - **Raw Telemetry**: Single 1-second pulse of 8500 $\mu\text{Sv/h}$, immediately returning to 28 $\mu\text{Sv/h}$.
  - **TDL Analysis**: Isolated transient spike; cumulative dose unchanged (<0.01 $\mu\text{Sv}$). Trust Score $S_{trust} = 0.28$.
  - **ML Decision**: `SENSOR_ARTIFACT_FALSE_ALARM` (Transient particle strike, not sustained SPE).
  - **Intervention**: Suppress radiation evacuation alarm. Cumulative EVA dose counter updated normally.
- **العربية**:
  - **السيناريو**: اصطدام أيون حديد كوني عالي الطاقة بمجس مقياس الإشعاع.
  - **البيانات المقاسة**: قفزة لحظية لمدة ثانية واحدة إلى 8500 ميكروسيفرت/ساعة وعودتها الفورية لـ 28.
  - **تحليل TDL**: نبضة إلكترونية معزولة لم تؤثر على الجرعة التراكمية. الموثوقية 28%.
  - **قرار الذكاء الاصطناعي**: تجاهل الإنذار كخلل عابر `SENSOR_ARTIFACT_FALSE_ALARM`.
  - **الإجراء الطبي**: منع إطلاق صفارات إخلاء الإشعاع وتحديث عداد الجرعة التراكمية بهدوء.

---

### Case 14: Dust Storm Optical Obstruction on Helmet Camera (حجب الرؤية في عاصفة الغبار)
- **English**:
  - **Scenario**: Jezero regional dust storm raises atmospheric optical depth ($\tau = 2.8$).
  - **Raw Telemetry**: Ambient solar irradiance drops from 590 $\text{W/m}^2$ to 85 $\text{W/m}^2$.
  - **TDL Analysis**: Validated by MEDA optical sensor cluster. Trust Score $S_{trust} = 0.96$.
  - **ML Decision**: Environmental dust hazard warning.
  - **Intervention**: Switch 3D scene to Storm Mode. Order return to lander along illuminated beacon trail.
- **العربية**:
  - **السيناريو**: هبوب عاصفة ترابية إقليمية بفوهة جيزيرو رفعت كثافة الغلاف الجوي ($\tau = 2.8$).
  - **البيانات المقاسة**: انخفاض الإشعاع الشمسي من 590 إلى 85 واط/م².
  - **تحليل TDL**: مطابقة البيانات مع مستشعرات محطة MEDA المناخية. الموثوقية 96%.
  - **قرار الذكاء الاصطناعي**: تحذير خطر بيئي بسبب العاصفة الترابية.
  - **الإجراء الطبي والعملياتي**: تحويل المشهد إلى وضع العاصفة، وتوجيه الرائد للعودة للمركبة متبعاً مسار المنارات.

---

### Case 15: Decompression Sickness (DCS) Bubble Formation (تكون فقاعات انخفاض الضغط)
- **English**:
  - **Scenario**: Fast depressurization profile during airlock egress without complete O2 pre-breathe.
  - **Raw Telemetry**: SpO2 = 91%, HR = 118 bpm, joint pain symptom reported.
  - **TDL Analysis**: All physiological channels verified. Trust Score $S_{trust} = 0.94$.
  - **ML Decision**: `DECOMPRESSION_RISK` (Caution, Confidence: 87%).
  - **Intervention**: NASA-STD-3001 §6.1.2: Increase suit pressure to 55 kPa (8.0 psi) hyperbaric treatment mode.
- **العربية**:
  - **السيناريو**: انخفاض سريع بالضغط عند الخروج من حجرة المعادلة دون استكمال تنفس الأكسجين النقي.
  - **البيانات المقاسة**: الأكسجين 91%، النبض 118، تقرير آلام في مفاصل الركبة.
  - **تحليل TDL**: قراءات المستشعرات مؤكدة وموثوقة بنسبة 94%.
  - **قرار الذكاء الاصطناعي**: خطر الإصابة بمرض انخفاض الضغط `DECOMPRESSION_RISK`.
  - **الإجراء الطبي**: رفع ضغط البذلة فوراً إلى 55 كيلو باسكال لتطبيق الضغط العلاجي العالي.

---

### Case 16: Physical Lab Sensor Duplication & Custom Field Validation (إنشاء وتكرار مستشعر)
- **English**:
  - **Scenario**: Physical Engineer duplicates a stock Pt100 RTD and adds a Mars Perchlorate Resistance custom field.
  - **Execution**: `POST /api/sensors/{id}/duplicate` -> `PATCH /api/sensors/{id}`.
  - **Verification**: New draft sensor created with incremented version snapshot; custom fields validated against JSON schema.
- **العربية**:
  - **السيناريو**: مهندس المستشعرات ينسخ مستشعر Pt100 RTD ويضيف حقلاً مخصصاً لمقاومة أملاح البيركلورات.
  - **التنفيذ**: استدعاء واجهة نسخ المستشعر وتعديل الحقول المخصصة.
  - **التحقق**: إنشاء مستشعر مسودة جديد مع تحديث سجل الإصدارات والتحقق من صحة الحقول المخصصة.

---

### Case 17: Three.js 3D Sensor Placement on Spacesuit Helmet (تثبيت مستشعر على خوذة البذلة في 3D)
- **English**:
  - **Scenario**: Biomedical engineer anchors an ambient radiation dosimeter to the spacesuit helmet visor mount.
  - **Execution**: In Lab Workbench ➔ 3D Placement Studio, select Helmet parent node, set offset (0, 0.22, 0.15).
  - **Verification**: Three.js canvas dynamically attaches 3D primitive sensor highlight to the astronaut helmet in real time.
- **العربية**:
  - **السيناريو**: تثبيت مقياس إشعاع على حامل خوذة رائد الفضاء ثلاثية الأبعاد.
  - **التنفيذ**: في استوديو التنسيق ثلاثي الأبعاد، اختيار عقدة الخوذة وضبط الإزاحة المكانية.
  - **التحقق**: يظهر المستشعر فوراً على خوذة رائد الفضاء في بيئة Three.js التفاعلية.

---

### Case 18: Physical AI Agent Compliance Audit under NASA-STD-3001 (تدقيق الذكاء الاصطناعي لمستشعر)
- **English**:
  - **Scenario**: Engineer asks Physical AI Agent: *"Audit test_pt100_rtd against NASA-STD-3001 thermal limits."*
  - **Execution**: Agent retrieves sensor specs, checks accuracy (±0.05°C), compares to human core range (35–42°C).
  - **Verification**: Agent generates compliance report with NASA citation and stages an approved diff proposal card.
- **العربية**:
  - **السيناريو**: المهندس يطلب من الذكاء الاصطناعي تدقيق مستشعر الحرارة وفق معايير ناسا.
  - **التنفيذ**: استرجاع المواصفات ومطابقة دقة القياس مع نطاق حرارة جسم الإنسان في الفضاء.
  - **التحقق**: توليد بطاقة تدقيق معتمدة ومطابقة للمعايير وتجهيز مقترح التعديل الآمن.

---

### Case 19: JSON/CSV Sensor Catalog Batch Import with Dry-Run (استيراد كتالوج المستشعرات)
- **English**:
  - **Scenario**: Instrumentation team imports 5 new biosensors from vendor CSV sheet.
  - **Execution**: Click **Import / Export** ➔ Upload CSV ➔ Click **Validate Input (Dry Run)**.
  - **Verification**: Dry-run parses schemas, verifies unit formats, detects duplicate keys, reports zero database write.
- **العربية**:
  - **السيناريو**: استيراد 5 مستشعرات حيوية جديدة من ملف CSV تم الحصول عليه من المورّد.
  - **التنفيذ**: الانتقال لتبويب الاستيراد/التصدير واختيار الفحص التجريبي (Dry Run).
  - **التحقق**: التحقق من سلامة البيانات والوحدات وعدم تكرار المفاتيح دون التأثير على قاعدة البيانات.

---

### Case 20: Examiner/Doctor Mobile QR Live Synchronization (مزامنة جوال الطبيب والممتحن عبر QR)
- **English**:
  - **Scenario**: Judge/Doctor at exhibition scans QR code with smartphone.
  - **Execution**: Scan QR link ➔ Opens `ViewerPage` ➔ Instant toggle to **🩺 Doctor / Examiner Mode**.
  - **Verification**: Real-time Lead-II ECG waveform animates on phone canvas; live TDL trust scores update synchronously with desktop mission simulation.
- **العربية**:
  - **السيناريو**: قيام عضو لجنة التحكيم أو الطبيب بمسح رمز QR بواسطة الهاتف الذكي أثناء المعرض.
  - **التنفيذ**: مسح الرمز والدخول المباشر إلى وضع الطبيب والممتحن السريري (Doctor Mode).
  - **التحقق**: ظهور تخطيط القلب الحي التفاعلي (ECG) على شاشة الجوال ومزامنة درجات موثوقية TDL فورياً مع شاشة الحاسوب الرئيسية.

---

## How to Test in the Live Application
1. **Start ASTRA**: `powershell -ExecutionPolicy Bypass -File scripts\start.ps1`
2. Open `http://localhost:8000` and login as **Physical Team** (`physical` / `astra-physical-2026`) or **Medical Team** (`medical` / `astra-medical-2026`).
3. **For Cases 1–5**: Navigate to **Medical Team** ➔ **⚡ TDL & ML Pipeline** tab. Click the scenario buttons (*SpO2 Motion Artifact*, *True Hypoxia*, *RTD Thermal Drift*, *Decompression Breach*, *Radiation Event*) to watch the 5-stage pipeline execute live!
4. **For 3D Mars Graphics**: Navigate to **Mission Control** (`/operator`). Switch between `☀️ Sol`, `🌫️ Haze`, and `🌪️ Storm`, and toggle `📐 Contours` and `🛰️ NASA Units`.
5. **For Doctor QR Access**: Click **🩺 Dr / Examiner QR** in the top bar to display the live QR code on screen. Scan with your mobile phone or click "Open Viewer" to experience the Doctor's mobile clinical console with live ECG!
