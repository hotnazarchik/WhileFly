#include <iostream>

using namespace std;

int main() {
    int n, m;
    int A[100], B[100];
    int R[100][100] = {0};

    cout << "Введіть кількість елементів A та B: ";
    cin >> n >> m;

    cout << "Введіть елементи A: ";
    for (int i = 0; i < n; ++i) cin >> A[i];

    cout << "Введіть елементи B: ";
    for (int j = 0; j < m; ++j) cin >> B[j];

    cout << "Матриця відношення R: " << endl;
    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < m; ++j) {
            if (A[i] + 2 > 3 * B[j]) {
                R[i][j] = 1;
            }
            cout << R[i][j] << " ";
        }
        cout << endl;
    }

    bool sameSets = (n == m);
    if (sameSets) {
        for (int i = 0; i < n; ++i) {
            if (A[i] != B[i]) {
                sameSets = false;
                break;
            }
        }
    }

    if (sameSets) {
        bool ref = true, sym = true;
        for (int i = 0; i < n; ++i) {
            if (R[i][i] != 1) ref = false;
            for (int j = 0; j < n; ++j) {
                if (R[i][j] != R[j][i]) sym = false;
            }
        }
        cout << "\nВластивості:\n";
        cout << "Рефлексивне: " << (ref ? "Так" : "Ні") << endl;
        cout << "Симетричне: " << (sym ? "Так" : "Ні") << endl;
    }

    return 0;
}   `