{
  "targets": [
    {
      "target_name": "syphon_addon",
      "sources": [ "native/syphon_addon.mm" ],
      "include_dirs": [
  "<!@(node -p \"require('node-addon-api').include\")",
  "<!@(node -p \"require('path').resolve('./frameworks/Syphon.framework/Headers')\")",
  "./frameworks/Syphon.framework/Headers"
      ],
      "libraries": [
             "-F./frameworks",
        "-F<!@(node -p \"require('path').resolve('./frameworks')\")",
        "-framework Syphon",
        "-framework Cocoa",
        "-framework OpenGL"
      ],
      "xcode_settings": {
        "OTHER_CPLUSPLUSFLAGS": [
          "-std=c++17",
          "-stdlib=libc++"
        ],
        "MACOSX_DEPLOYMENT_TARGET": "10.13",
        "FRAMEWORK_SEARCH_PATHS": [
          "<!@(node -p \"require('path').resolve('./frameworks')\")"
        ],
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "OTHER_LDFLAGS": [
          "-Wl,-rpath,@loader_path/../../frameworks",
          "-Wl,-rpath,@executable_path/../frameworks"
        ],
   "ARCHS": ["x86_64", "arm64"],
"VALID_ARCHS": ["x86_64", "arm64"],
        "ONLY_ACTIVE_ARCH": "NO",
           "FRAMEWORK_SEARCH_PATHS": [
          "./frameworks"
        ],
"HEADER_SEARCH_PATHS": [
  "./frameworks/Syphon.framework/Headers"
]
      },
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_VERSION=8" ],    

    }
  ]
}