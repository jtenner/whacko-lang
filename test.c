__attribute__((import_module("env"), import_name("externalFunction"))) int add(int a, int b);

int main() {
  return add(1, 2);
}
