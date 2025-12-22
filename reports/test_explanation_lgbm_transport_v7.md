# 📊 Model Performance & Methodology Report
**Model Version:** lgbm_transport_v7  
**Date:** 2025-12-22 23:57:42

## 1. Executive Summary
Our model predicts passenger demand with a **Volume-Weighted Accuracy of 85.0%**.  
This means that relative to the total passenger volume, our average error margin is only **15.0%**.

---

## 2. Detailed Metric Explanations

### A. MAE (Mean Absolute Error)
**What is it?**  
The average number of passengers we "miss" by per hour.

* **The Math:**  
  $MAE = \frac{1}{n} \sum | \text{Actual} - \text{Predicted} |$

* **Simulated Example:**  
  If a bus actually has **100** passengers, and we predict **110**:  
  Error = |100 - 110| = **10 passengers**.  
  We repeat this for all lines and take the average.

* **Our Model's Result:**  
  **73 Passengers** (On average, we deviate by this amount).

---

### B. NMAE (Normalized Mean Absolute Error)
**What is it?**  
The error rate relative to the "busyness" of the line. An error of 10 people matters less on a Metro (1000 people) than on a Minibus (20 people).

* **The Math:**  
  $NMAE = \frac{MAE}{\text{Average Passenger Count}}$

* **Simulated Example:**  
  If the average passenger count is **1000** and our MAE is **72**:  
  $NMAE = \frac{72}{1000} = 0.072 \quad (7.2\%)$

* **Our Model's Result:**  
  **15.0%** (This is our weighted error rate).

---

### C. Accuracy (Volume-Weighted)
**What is it?**  
The opposite of error. It represents our confidence level in meeting the total passenger demand.

* **The Math:**  
  $Accuracy = 1 - NMAE$

* **Our Model's Result:**  
  **85.0%** (We successfully predicted this percentage of the total volume).

---

## 3. Comparative Success (Baseline)
**Why use AI?**  
If we simply assumed "Today will be exactly like Yesterday" (Naive Approach), our error would be **306** passengers.  
By using this model, we reduced the error by **76.1%**.

**Error Rate Comparison:**  
- **Naive Baseline (Lag-24h) NMAE:** 62.7%  
- **Our Model NMAE:** 15.0%  
- **Improvement:** Our model reduces the global error rate from 62.7% down to 15.0%.

---

## 4. Additional Metrics

### RMSE (Root Mean Squared Error)
**What is it?**  
Similar to MAE but penalizes larger errors more heavily. Useful for identifying systematic over/underpredictions.

* **Our Model's Result:**  
  **290**

### SMAPE (Symmetric Mean Absolute Percentage Error)
**What is it?**  
A percentage-based metric that normalizes errors symmetrically. Can appear high during low-volume hours (e.g., nights).

* **Our Model's Result:**  
  **44.8%**

* **Context:**  
  While the SMAPE (44.8%) might look high due to low-volume night hours, the Volume-Weighted Accuracy (85.0%) confirms the system is reliable for high-capacity planning.

---

## 5. Performance by Segment

### Worst Performing Lines (High Volume Context)
High MAE often correlates with high passenger volume. Here is the context:

| Line | MAE | Avg Volume | Error Rate (NMAE) |
|------|-----|------------|-------------------|
| MARMARAY | 2010 | 23,900 | 8.4% |
| 34 | 1944 | 22,284 | 8.7% |
| M2 | 1678 | 16,071 | 10.4% |
| T1 | 1509 | 15,050 | 10.0% |
| M3 | 1470 | 5,341 | 27.5% |
| M1 | 1120 | 12,781 | 8.8% |
| M5 | 1020 | 11,020 | 9.3% |
| M4 | 990 | 10,817 | 9.2% |
| M7 | 811 | 8,235 | 9.9% |
| T4 | 661 | 7,035 | 9.4% |

### Performance by Hour of Day
The model shows varying accuracy across different hours:
- **Hour 0**: MAE = 110.4
- **Hour 1**: MAE = 114.5
- **Hour 2**: MAE = 123.3
- **Hour 3**: MAE = 157.1
- **Hour 4**: MAE = 100.5
- **Hour 5**: MAE = 44.6
- **Hour 6**: MAE = 62.8
- **Hour 7**: MAE = 86.8
- **Hour 8**: MAE = 88.2
- **Hour 9**: MAE = 71.0
- **Hour 10**: MAE = 60.9
- **Hour 11**: MAE = 62.3
- **Hour 12**: MAE = 65.2
- **Hour 13**: MAE = 69.3
- **Hour 14**: MAE = 69.6
- **Hour 15**: MAE = 70.3
- **Hour 16**: MAE = 69.6
- **Hour 17**: MAE = 87.3
- **Hour 18**: MAE = 96.2
- **Hour 19**: MAE = 73.9
- **Hour 20**: MAE = 62.9
- **Hour 21**: MAE = 60.7
- **Hour 22**: MAE = 72.3
- **Hour 23**: MAE = 66.2

---

## 6. Conclusion
This model demonstrates strong predictive performance with a **85.0% accuracy rate** when weighted by passenger volume.  
The **76.1% improvement** over naive baseline methods validates the use of machine learning for public transportation demand forecasting.

**Tested on:** 537,198 samples  
**Prediction Time:** 5.293 seconds
