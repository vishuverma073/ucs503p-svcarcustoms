% tietreport.cls -- TIET project report layout (UCS503).
% Reproduces the layout of the TIET report template: centred title
% page, right-aligned "Chapter N" headings with a rule, and a running
% header "<page>  <course>" / "<project>  <page>".
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{tietreport}[2026/11/26 TIET project report]
\LoadClass[11pt,twoside,openright]{report}

\RequirePackage[a4paper,top=30mm,bottom=30mm,inner=30mm,outer=30mm,headheight=14pt]{geometry}
\RequirePackage[T1]{fontenc}
\RequirePackage{lmodern}
\RequirePackage{microtype}
\RequirePackage{graphicx}
\RequirePackage{xcolor}
\RequirePackage{booktabs,tabularx,array,longtable}
\RequirePackage{enumitem}
\RequirePackage{titlesec}
\RequirePackage{fancyhdr}
\RequirePackage{amsmath}
\RequirePackage{tikz}
\usetikzlibrary{arrows.meta,positioning,shapes.geometric,shapes.misc,shapes.multipart,fit,calc,backgrounds}
\RequirePackage[hidelinks]{hyperref}
\RequirePackage{caption}
\RequirePackage{float}
\captionsetup{font=small}

% ---- Metadata -------------------------------------------------------
\newcommand{\coursecode}[1]{\gdef\@coursecode{#1}}
\newcommand{\projecttitle}[1]{\gdef\@projecttitle{#1}}
\newcommand{\projectsubtitle}[1]{\gdef\@projectsubtitle{#1}}
\newcommand{\students}[1]{\gdef\@students{#1}}
\newcommand{\group}[1]{\gdef\@group{#1}}
\newcommand{\supervisor}[1]{\gdef\@supervisor{#1}}
\newcommand{\evaluation}[1]{\gdef\@evaluation{#1}}
\newcommand{\department}[1]{\gdef\@department{#1}}
\newcommand{\institute}[1]{\gdef\@institute{#1}}
\coursecode{Course Code - Course Title}
\projecttitle{Project Title}
\projectsubtitle{}
\students{}
\group{}
\supervisor{}
\evaluation{Evaluation}
\department{Computer Science and Engineering Department}
\institute{Thapar Institute of Engineering and Technology, Patiala}

% ---- Title page ------------------------------------------------------
\renewcommand{\maketitle}{%
  \begin{titlepage}
    \centering
    \vspace*{30mm}
    {\large\bfseries \@coursecode\par}
    \vspace{18mm}
    {\LARGE\bfseries \@projecttitle\par}
    \vspace{1mm}
    {\small \@projectsubtitle\par}
    \vspace{32mm}
    {\large\bfseries Submitted by:\par}
    \vspace{2mm}
    {\large \@students\par}
    \vspace{3mm}
    {\small \@group\par}
    \vspace{26mm}
    {\large\bfseries Submitted to:\par}
    \vspace{1mm}
    {\small \@supervisor\par}
    \vfill
    {\large \@evaluation\par}
    \vspace{1mm}
    {\large\bfseries \@department\par}
    {\small \@institute\par}
    \vspace*{6mm}
  \end{titlepage}
  \cleardoublepage}

% ---- Chapter headings ------------------------------------------------
\titleformat{\chapter}[display]
  {\normalfont\raggedleft}
  {\large\bfseries\chaptertitlename\ \thechapter}
  {2pt}
  {\Huge\bfseries}
  [\vspace{4pt}\titlerule]
\titleformat{name=\chapter,numberless}[display]
  {\normalfont\raggedleft}{}{0pt}{\Huge\bfseries}[\vspace{4pt}\titlerule]
\titlespacing*{\chapter}{0pt}{40pt}{28pt}
\titleformat{\section}{\normalfont\Large\bfseries}{\thesection}{1em}{}
\titleformat{\subsection}{\normalfont\large\bfseries}{\thesubsection}{1em}{}
\titleformat{\subsubsection}{\normalfont\normalsize\bfseries}{\thesubsubsection}{1em}{}

% ---- Running header --------------------------------------------------
\pagestyle{fancy}
\fancyhf{}
\fancyhead[LE]{\thepage\quad \@coursecode}
\fancyhead[RO]{\@projecttitle\quad \thepage}
\renewcommand{\headrulewidth}{0.6pt}
\fancypagestyle{plain}{\fancyhf{}\renewcommand{\headrulewidth}{0pt}}

\setlist{itemsep=2pt,topsep=4pt}
\setlength{\parskip}{0pt}
\renewcommand{\arraystretch}{1.25}

% Diagram styles shared by every figure.
\tikzset{
  box/.style={draw,rounded corners=2pt,fill=black!4,align=center,font=\small,inner sep=5pt,minimum height=8mm},
  ext/.style={draw,fill=black!10,align=center,font=\small,inner sep=5pt,minimum height=8mm},
  uc/.style={draw,ellipse,fill=black!3,align=center,font=\footnotesize,inner sep=2pt,minimum width=40mm,minimum height=7mm},
  arr/.style={-{Stealth[length=2.2mm]},thin},
  darr/.style={-{Stealth[length=2.2mm]},thin,dashed},
  lbl/.style={font=\scriptsize,fill=white,inner sep=1pt,align=center},
  state/.style={draw,rounded corners=3pt,fill=black!4,font=\footnotesize,minimum width=22mm,minimum height=7mm},
  proc/.style={draw,circle,fill=black!4,align=center,font=\footnotesize,minimum size=20mm},
  store/.style={draw,align=center,font=\footnotesize,minimum height=6mm,inner sep=3pt},
}
% Stick-figure actor.
\newcommand{\actor}[3]{%
  \begin{scope}[shift={(#1)}]
    \draw (0,0.55) circle (0.15);
    \draw (0,0.4) -- (0,0.05) (-0.25,0.28) -- (0.25,0.28) (0,0.05) -- (-0.2,-0.25) (0,0.05) -- (0.2,-0.25);
    \node[font=\footnotesize,align=center,anchor=south] (#2) at (0,0.75) {#3};
  \end{scope}}
\newcommand{\rupee}{Rs.\,}
\endinput
