#include <clang/Basic/TargetInfo.h>
#include <clang/AST/ASTConsumer.h>
#include <clang/Lex/HeaderSearchOptions.h>
#include <clang/Lex/PreprocessorOptions.h>
#include <clang/Parse/Parser.h>

int main(int argc, char **argv) {
    clang::DiagnosticsEngine diagnostics_engine(
        llvm::IntrusiveRefCntPtr<clang::DiagnosticIDs>(std::make_unique<clang::DiagnosticIDs>()),
        llvm::IntrusiveRefCntPtr<clang::DiagnosticOptions>(std::make_unique<clang::DiagnosticOptions>())
    );
    clang::LangOptions lang_options;
    llvm::Triple triple(llvm::Twine("wasm32-unknown-emscripten"));
    std::vector<std::string> includes = {};
    clang::LangOptions::setLangDefaults(lang_options, clang::Language::CXX, triple, includes);
    // clang::ModuleLoader module_loader;
    clang::TrivialModuleLoader module_loader;
    clang::FileSystemOptions file_system_options;
    clang::FileManager file_manager(file_system_options);
    clang::SourceManager source_manager(diagnostics_engine, file_manager);
    std::shared_ptr<clang::TargetOptions> target_options = std::make_shared<clang::TargetOptions>();
    target_options->Triple = "wasm32-unknown-emscripten";
    clang::TargetInfo* target_info = clang::TargetInfo::CreateTargetInfo(diagnostics_engine, target_options);
    clang::HeaderSearch header_search(
        std::make_shared<clang::HeaderSearchOptions>(),
        source_manager,
        diagnostics_engine,
        lang_options,
        target_info
    );
    clang::Preprocessor preprocessor(
        std::make_shared<clang::PreprocessorOptions>(),
        diagnostics_engine,
        lang_options,
        source_manager,
        header_search,
        module_loader
    );
    preprocessor.Initialize(*target_info, nullptr);
    clang::IdentifierTable identifier_table(lang_options);
    clang::SelectorTable selector_table;
    clang::Builtin::Context builtin_context;
    builtin_context.InitializeTarget(*target_info, nullptr);
    builtin_context.initializeBuiltins(identifier_table, lang_options);
    clang::ASTContext ast_context(
        lang_options,
        source_manager,
        identifier_table,
        selector_table,
        builtin_context,
        clang::TranslationUnitKind::TU_Prefix
    );
    clang::ASTConsumer ast_consumer;
    clang::Sema sema(preprocessor, ast_context, ast_consumer);
    clang::Parser parser(preprocessor, sema, true);
    parser.Initialize();
    sema.Initialize();
}