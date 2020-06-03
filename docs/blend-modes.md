# ブレンドモードの分類

$a$がベースレイヤー、 $b$が上に重ねるレイヤー。反転値を、それぞれ$\overline{a} = 1 - a, \overline{b} = 1 - b$とします。

### 通常

上のレイヤーの色だけを取る。

| 名前             | 計算式 |
| ---------------- | ------ |
| Normal           | $b$    |
| Destination Over | $a$    |

### 加算

| 名前        | 計算式      |
| ----------- | ----------- |
| Add         | $a + b$     |
| Subtract    | $a - b$     |
| AddSub      |             |
| Linear Burn | $a + b - 1$ |

Add は Linear Dodge とも。この対応が分かりづらい。
AddSub は Substance Designer にあるブレンドモード。

### 乗算

| 名前       | 計算式                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Multiply   | $ab$                                                                                                              |
| Screen     | $\overline{\overline{a}\ \overline{b}}$                                                                           |
| Overlay    | $\begin{cases} 2ab, & \text{if}\ a>0.5 \\ \overline{2\overline{a}\ \overline{b}}, & \text{otherwise} \end{cases}$ |
| Hard Light | $\begin{cases} 2ab, & \text{if}\ b>0.5 \\ \overline{2\overline{a}\ \overline{b}}, & \text{otherwise} \end{cases}$ |

下 2 つは、$a$、$b$いずれかが 50%グレーより明るければ Screen、暗ければ Multiply と場合分けします。明るい色はより明るく、暗い色はより暗くなるということです。Overlay の場合は$a$を基準に、Hard Light は$b$を場合分けの基準にするだけ。つまり、$Overlay(b, a) = HardLight(a, b)$ の関係です。

### 最大・最小

| 名前      | 計算式      |
| --------- | ----------- |
| Lighten   | $max(a, b)$ |
| Darken    | $min(a, b)$ |
| Pin Light |             |

### 除算

| Mode        | Calculation                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------- |
| Color Dodge | $\begin{cases} 1, & \text{if}\ b=1\\ a / \overline{b}, & \text{otherwise} \end{cases}$            |
| Color Burn  | $\begin{cases} 0, & \text{if}\ b=0\\ \overline{\overline{a} / b}, & \text{otherwise} \end{cases}$ |
| Vivid Light |                                                                                                   |

Dodge と Burn の場合分けは単にゼロ除算対策のため。やっていることは至ってシンプル。

Vivid Light は場合分け b を基準としたバージョン。

### 差分

| 名前       | 計算式                              |
| ---------- | ----------------------------------- |
| Difference | $\|a - b\|$                         |
| Exclusion  | $\overline{a}\ b + a\ \overline{b}$ |

Subtract だと、負の値を取ることもあるが、絶対値をとって必ず 0-1 になるようにしたのが Difference。

Exclusion は、ニュアンスとしては 50%グレーを基準にした Difference。a, b が同じとき、Difference の場合は 0（黒）になるが、Exclusion は 0.5（50%グレー）になる。

### Soft Light

上のレイヤーの値に基づき僅かに明るくなったり暗くなったりする。

| 名前       | 計算式                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Soft Light | $ \begin{cases} 2ab + a^2(1 - 2b), & \text{if}\ b < 0.5\\ 2a\overline{b} + a^{0.5}(2b - 1), & \text{otherwise} \end{cases}$ |
