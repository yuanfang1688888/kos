import SwiftUI

struct ContentView: View {
    @State private var isLoading = true
    @State private var canGoBack = false
    @State private var canGoForward = false
    @State private var showError = false

    private let homeURL = URL(string: "https://wap.kaiyun668.top")!

    var body: some View {
        ZStack {
            // WebView 主体
            WebView(
                url: homeURL,
                isLoading: $isLoading,
                canGoBack: $canGoBack,
                canGoForward: $canGoForward
            )
            .edgesIgnoringSafeArea(.all)

            // 加载指示器
            if isLoading {
                VStack {
                    Spacer()
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(1.5)
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.black.opacity(0.6))
                                .frame(width: 80, height: 80)
                        )
                    Spacer()
                }
            }
        }
        .preferredColorScheme(.light)
    }
}

#Preview {
    ContentView()
}
