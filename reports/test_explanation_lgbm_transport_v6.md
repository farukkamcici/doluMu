# 📊 Model Performance & Methodology Report
**Model Version:** lgbm_transport_v6  
**Date:** 2025-12-06 18:16:35

## 1. Executive Summary
Our model predicts passenger demand with a **Volume-Weighted Accuracy of 84.1%**.  
This means that relative to the total passenger volume, our average error margin is only **15.9%**.

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
  **15.9%** (This is our weighted error rate).

---

### C. Accuracy (Volume-Weighted)
**What is it?**  
The opposite of error. It represents our confidence level in meeting the total passenger demand.

* **The Math:**  
  $Accuracy = 1 - NMAE$

* **Our Model's Result:**  
  **84.1%** (We successfully predicted this percentage of the total volume).

---

## 3. Comparative Success (Baseline)
**Why use AI?**  
If we simply assumed "Today will be exactly like Yesterday" (Naive Approach), our error would be **290** passengers.  
By using this model, we reduced the error by **74.9%**.

**Error Rate Comparison:**  
- **Naive Baseline (Lag-24h) NMAE:** 63.4%  
- **Our Model NMAE:** 15.9%  
- **Improvement:** Our model reduces the global error rate from 63.4% down to 15.9%.

---

## 4. Additional Metrics

### RMSE (Root Mean Squared Error)
**What is it?**  
Similar to MAE but penalizes larger errors more heavily. Useful for identifying systematic over/underpredictions.

* **Our Model's Result:**  
  **289**

### SMAPE (Symmetric Mean Absolute Percentage Error)
**What is it?**  
A percentage-based metric that normalizes errors symmetrically. Can appear high during low-volume hours (e.g., nights).

* **Our Model's Result:**  
  **45.6%**

* **Context:**  
  While the SMAPE (45.6%) might look high due to low-volume night hours, the Volume-Weighted Accuracy (84.1%) confirms the system is reliable for high-capacity planning.

---

## 5. Performance by Segment

### Worst Performing Lines (High Volume Context)
High MAE often correlates with high passenger volume. Here is the context:

| Line | MAE | Avg Volume | Error Rate (NMAE) |
|------|-----|------------|-------------------|
| MARMARAY | 2058 | 23,900 | 8.6% |
| 34 | 1997 | 22,284 | 9.0% |
| M2 | 1711 | 16,071 | 10.6% |
| M3 | 1589 | 5,341 | 29.8% |
| T1 | 1552 | 15,050 | 10.3% |
| M5 | 1362 | 11,020 | 12.4% |
| M1 | 1331 | 12,781 | 10.4% |
| M4 | 1125 | 10,817 | 10.4% |
| M7 | 838 | 8,235 | 10.2% |
| T4 | 675 | 7,035 | 9.6% |

### Performance by Hour of Day
The model shows varying accuracy across different hours:
- **Hour 0**: MAE = 106.5
- **Hour 1**: MAE = 99.1
- **Hour 2**: MAE = 96.3
- **Hour 3**: MAE = 113.9
- **Hour 4**: MAE = 90.7
- **Hour 5**: MAE = 42.6
- **Hour 6**: MAE = 64.8
- **Hour 7**: MAE = 88.3
- **Hour 8**: MAE = 87.1
- **Hour 9**: MAE = 69.1
- **Hour 10**: MAE = 61.3
- **Hour 11**: MAE = 61.6
- **Hour 12**: MAE = 65.0
- **Hour 13**: MAE = 68.9
- **Hour 14**: MAE = 69.0
- **Hour 15**: MAE = 69.1
- **Hour 16**: MAE = 67.9
- **Hour 17**: MAE = 88.5
- **Hour 18**: MAE = 94.0
- **Hour 19**: MAE = 73.5
- **Hour 20**: MAE = 64.6
- **Hour 21**: MAE = 65.1
- **Hour 22**: MAE = 74.0
- **Hour 23**: MAE = 66.3

---

## 6. Conclusion
This model demonstrates strong predictive performance with a **84.1% accuracy rate** when weighted by passenger volume.  
The **74.9% improvement** over naive baseline methods validates the use of machine learning for public transportation demand forecasting.

**Tested on:** 606,852 samples  
**Prediction Time:** 5.615 seconds
