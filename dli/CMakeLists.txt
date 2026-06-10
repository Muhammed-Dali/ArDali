cmake_minimum_required(VERSION 3.16)
project(ardali_dli_analyzers VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets)

add_library(ardali-dli-analyzers STATIC
    analyzers/analyzerbase.cpp
    analyzers/analyzercontainer.cpp
    analyzers/baranalyzer.cpp
    analyzers/blockanalyzer.cpp
    analyzers/boomanalyzer.cpp
    analyzers/enginebase.cpp
    analyzers/fht.cpp
    analyzers/sonogram.cpp
    analyzers/turbine.cpp
)

target_include_directories(ardali-dli-analyzers PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/analyzers
)

target_link_libraries(ardali-dli-analyzers PUBLIC
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
)

target_compile_options(ardali-dli-analyzers PRIVATE
    $<$<CONFIG:Release>:-O3 -DNDEBUG>
    $<$<CONFIG:Debug>:-O0 -g>
)
